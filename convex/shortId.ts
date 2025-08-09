import { customAlphabet } from 'nanoid';
import { mutation } from './_generated/server';

/**
 * Generate a URL-friendly short ID using nanoid
 *
 * Uses a custom alphabet excluding similar-looking characters:
 * - No 0/O, 1/I/l confusion
 * - Only URL-safe characters
 * - 8 characters provide ~208 billion unique combinations
 */
const NANOID_ALPHABET =
  '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const NANOID_LENGTH = 8;

// Create nanoid generator with custom alphabet
const generateId = customAlphabet(NANOID_ALPHABET, NANOID_LENGTH);

/**
 * Generate a short ID for a product using nanoid
 */
export const generateShortId = mutation({
  args: {},
  handler: (): string => {
    // Generate a collision-resistant, URL-friendly ID
    return generateId();
  },
});
