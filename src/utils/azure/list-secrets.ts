import type { SecretClient } from '@azure/keyvault-secrets';

/**
 * List all secrets in Azure Key Vault filtered by project name
 * Returns map of secret names to their values
 */
export async function listSecrets(
  client: SecretClient,
  projectName: string
): Promise<Record<string, string>> {
  const secrets: Record<string, string> = {};

  // List all secret properties (names and tags)
  for await (const properties of client.listPropertiesOfSecrets()) {
    // Filter by project-name tag
    if (properties.tags?.['project-name'] === projectName) {
      const secretName = properties.name;

      // Get the actual secret value
      const secret = await client.getSecret(secretName);
      if (secret.value) {
        secrets[secretName] = secret.value;
      }
    }
  }

  return secrets;
}