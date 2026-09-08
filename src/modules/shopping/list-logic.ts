/**
 * Pure helper for the "recently bought" natural key. Small, but easy to
 * get subtly wrong, so it gets a real unit test rather than living inline.
 */

/** The natural key for "recently bought" dedup — same item, any casing/whitespace. */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}
