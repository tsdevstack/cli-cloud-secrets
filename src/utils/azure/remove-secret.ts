import type { SecretClient } from '@azure/keyvault-secrets';

/**
 * Delete a secret from Azure Key Vault
 * Note: Azure soft-deletes secrets by default (recoverable for 90 days)
 */
export async function removeSecret(
  client: SecretClient,
  secretName: string
): Promise<void> {
  const poller = await client.beginDeleteSecret(secretName);
  await poller.pollUntilDone();
}