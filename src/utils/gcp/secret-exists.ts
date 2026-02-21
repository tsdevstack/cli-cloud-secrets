import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

/**
 * Check if secret exists in GCP Secret Manager
 */
export async function secretExists(
  client: SecretManagerServiceClient,
  projectId: string,
  secretId: string,
): Promise<boolean> {
  try {
    await client.getSecret({
      name: `projects/${projectId}/secrets/${secretId}`,
    });
    return true;
  } catch {
    return false;
  }
}