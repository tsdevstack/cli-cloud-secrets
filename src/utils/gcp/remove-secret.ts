import type { SecretManagerServiceClient } from '@google-cloud/secret-manager';

/**
 * Delete a secret from GCP Secret Manager
 */
export async function removeSecret(
  client: SecretManagerServiceClient,
  projectId: string,
  secretName: string,
): Promise<void> {
  await client.deleteSecret({
    name: `projects/${projectId}/secrets/${secretName}`,
  });
}
