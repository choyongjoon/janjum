/**
 * Collapse repeated rows before they reach the upload mutation.
 *
 * Several crawlers emit the same product more than once: Mega re-extracts the
 * same "All Menu" list on every pagination step and again after "Load More",
 * and Paik lists a drink under multiple categories. Because `upsertProduct`
 * keys on `externalId`, every repeat patched the *same* database record again
 * within one transaction -- 691 of 3,427 rows in a recent sync, ~20% of the
 * write volume, all of it redundant.
 *
 * Rows that are byte-identical are pure noise and are dropped silently. Rows
 * that share an `externalId` but genuinely differ are a crawler bug (the id
 * scheme cannot tell two real menu items apart), so they are reported rather
 * than quietly resolved -- the caller decides what to do with them.
 */

interface ProductLike {
  externalId: string;
  name?: unknown;
}

export interface DedupeConflict {
  externalId: string;
  name: string;
  variants: number;
}

export interface DedupeReport<T> {
  conflicts: DedupeConflict[];
  exactDuplicatesDropped: number;
  products: T[];
}

/**
 * Order-independent structural key, so two rows that differ only in property
 * order still count as identical.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

export function dedupeByExternalId<T extends ProductLike>(
  products: T[]
): DedupeReport<T> {
  const groups = new Map<string, { keys: Set<string>; rows: T[] }>();

  for (const product of products) {
    let group = groups.get(product.externalId);
    if (!group) {
      group = { keys: new Set(), rows: [] };
      groups.set(product.externalId, group);
    }
    const key = canonicalize(product);
    // Keep the first occurrence of each distinct row; later byte-identical
    // repeats add nothing.
    if (!group.keys.has(key)) {
      group.keys.add(key);
      group.rows.push(product);
    }
  }

  const deduped: T[] = [];
  const conflicts: DedupeConflict[] = [];

  for (const [externalId, group] of groups) {
    // Always upload exactly one row per externalId -- uploading more only
    // overwrites the previous one, and which row survives depends on file
    // order. Taking the first makes that deterministic.
    deduped.push(group.rows[0]);

    if (group.rows.length > 1) {
      conflicts.push({
        externalId,
        name: String(group.rows[0].name ?? externalId),
        variants: group.rows.length,
      });
    }
  }

  return {
    products: deduped,
    exactDuplicatesDropped:
      products.length - deduped.length - conflictExtras(conflicts),
    conflicts,
  };
}

/** Rows discarded because they conflicted, not because they were identical. */
function conflictExtras(conflicts: DedupeConflict[]): number {
  return conflicts.reduce((sum, c) => sum + (c.variants - 1), 0);
}
