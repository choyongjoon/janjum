import { customAlphabet } from "nanoid";

/**
 * Generate a URL-friendly short ID using nanoid
 *
 * Uses a custom alphabet excluding similar-looking characters:
 * - No 0/O, 1/I/l confusion
 * - Only URL-safe characters
 * - 8 characters provide ~208 billion unique combinations
 */
const NANOID_ALPHABET =
  "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const NANOID_LENGTH = 8;

// Create nanoid generator with custom alphabet
const generateId = customAlphabet(NANOID_ALPHABET, NANOID_LENGTH);

/**
 * Generate a short ID for a product using nanoid.
 *
 * A plain function, not a Convex mutation: it touches no data, so exposing it
 * as a public mutation only widened the API surface, and calling it through
 * `ctx.runMutation` cost a nested mutation on every product insert.
 */
export function generateShortId(): string {
  // Generate a collision-resistant, URL-friendly ID
  return generateId();
}
