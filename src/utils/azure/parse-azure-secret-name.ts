import type { ExtractedSecret } from '../extract-key-and-scope-from-secret-name';

/**
 * Parse an Azure Key Vault secret name into key and scope
 *
 * Azure Key Vault names only allow alphanumerics and hyphens, so the framework
 * writes `${projectName}-${scope}-${KEY}` with every underscore turned into a
 * hyphen (DATABASE_URL → DATABASE-URL). The key therefore contains hyphens too,
 * and the scope/key boundary is the hyphen before the first segment that starts
 * with an uppercase letter (scopes are lowercase, keys are UPPERCASE).
 *
 * Input: "tsdevstack-shared-JWT-PRIVATE-KEY-CURRENT"
 *   → { key: "JWT_PRIVATE_KEY_CURRENT", scope: "shared" }
 * Input: "tsdevstack-auth-service-ADMIN-EMAILS"
 *   → { key: "ADMIN_EMAILS", scope: "auth-service" }
 *
 * Returns null when the name does not start with the project prefix or does
 * not have the `{scope}-{KEY}` shape.
 */
export function parseAzureSecretName(
  secretName: string,
  projectName: string,
): ExtractedSecret | null {
  const prefix = `${projectName}-`;
  if (!secretName.startsWith(prefix)) {
    return null;
  }

  // Remove project prefix: "auth-service-ADMIN-EMAILS"
  const rest = secretName.substring(prefix.length);

  // scope: lowercase letters, digits, hyphens (starts with a letter)
  // key: starts with an uppercase letter, then uppercase letters, digits, hyphens
  const match = rest.match(/^([a-z][a-z0-9-]*)-([A-Z][A-Z0-9-]*)$/);
  if (!match) {
    return null;
  }

  const scope = match[1];
  // Reverse the Azure transform: ADMIN-EMAILS → ADMIN_EMAILS
  const key = match[2].replace(/-/g, '_');

  return { key, scope };
}
