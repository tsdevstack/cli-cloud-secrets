/**
 * Extract key and scope from secret name
 */

export interface ExtractedSecret {
  key: string;
  scope: string; // 'shared' or service name
}

/**
 * Extract key and scope from secret name (all secrets including service-scoped)
 * Input: "tsdevstack-shared-DATABASE_URL" -> { key: "DATABASE_URL", scope: "shared" }
 * Input: "tsdevstack-auth-service-DATABASE_URL" -> { key: "DATABASE_URL", scope: "auth-service" }
 *
 * Format: ${projectName}-${scope}-${KEY}
 * - scope is lowercase-with-hyphens (e.g., "shared", "auth-service")
 * - KEY is UPPERCASE_WITH_UNDERSCORES (e.g., "DATABASE_URL")
 * - The hyphen before the first uppercase letter marks the boundary
 */
export function extractKeyAndScopeFromSecretName(
  secretName: string,
  projectName: string,
): ExtractedSecret | null {
  const prefix = `${projectName}-`;
  if (!secretName.startsWith(prefix)) {
    return null;
  }

  // Remove project prefix: "auth-service-DATABASE_URL"
  const rest = secretName.substring(prefix.length);

  // Find where the KEY starts (first uppercase letter)
  // The hyphen before it separates scope from key
  const match = rest.match(/^(.+)-([A-Z][A-Z0-9_]*)$/);
  if (!match) {
    return null;
  }

  const scope = match[1]; // "auth-service" or "shared"
  const key = match[2]; // "DATABASE_URL"

  return { key, scope };
}