import type { SecretClient } from '@azure/keyvault-secrets';

/**
 * Check if a secret exists in Azure Key Vault
 */
export async function secretExists(
  client: SecretClient,
  secretName: string
): Promise<boolean> {
  try {
    await client.getSecret(secretName);
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}