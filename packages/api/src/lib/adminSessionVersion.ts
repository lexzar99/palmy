/** Legacy tokens without a claim are version zero, never exempt from revocation. */
export function adminTokenVersionMatches(
  tokenVersion: unknown,
  currentVersion: unknown,
): boolean {
  const issued = typeof tokenVersion === 'number' && Number.isInteger(tokenVersion)
    ? tokenVersion
    : 0;
  const current = typeof currentVersion === 'number' && Number.isInteger(currentVersion)
    ? currentVersion
    : 0;
  return issued === current;
}
