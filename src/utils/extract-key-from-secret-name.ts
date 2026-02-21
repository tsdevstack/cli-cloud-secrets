/**
 * Extract key from secret name (shared secrets only)
 */

/**
 * Extract key from secret name (shared secrets only - for backward compatibility)
 * Input: "tsdevstack-shared-DATABASE_URL"
 * Output: "DATABASE_URL"
 */
export function extractKeyFromSecretName(
  secretName: string,
  projectName: string,
): string | null {
  const prefix = `${projectName}-shared-`;
  if (!secretName.startsWith(prefix)) {
    return null;
  }
  return secretName.substring(prefix.length);
}