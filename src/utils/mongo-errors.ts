/** True for a MongoDB duplicate-key error (code 11000) on a unique index. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}
