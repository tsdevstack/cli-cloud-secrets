/**
 * Build Key Vault name from project name and environment
 * Format: {projectName}-{env}-kv
 * Azure Key Vault names must be globally unique and 3-24 characters
 */
export function buildKeyVaultName(projectName: string, env: string): string {
  // Azure Key Vault names: 3-24 chars, alphanumeric and hyphens only
  const sanitized = `${projectName}-${env}-kv`.toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (sanitized.length > 24) {
    // Truncate if too long, keeping the -kv suffix
    return sanitized.substring(0, 21) + '-kv';
  }

  return sanitized;
}