import type { SecretClient } from '@azure/keyvault-secrets';

/**
 * Get secret value from Azure Key Vault
 */
export async function getSecret(
  client: SecretClient,
  secretName: string
): Promise<string | null> {
  try {
    const secret = await client.getSecret(secretName);
    return secret.value || null;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}