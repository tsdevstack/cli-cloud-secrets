/**
 * Get secret value from GCP Secret Manager
 */

import type { SecretManagerServiceClient } from '@google-cloud/secret-manager';

/**
 * Get secret value from GCP Secret Manager
 *
 * @param client - Secret Manager client
 * @param secretName - Full secret name (e.g., "projects/my-project/secrets/my-secret")
 * @returns Secret value or null if not found
 */
export async function getSecret(
  client: SecretManagerServiceClient,
  secretName: string
): Promise<string | null> {
  try {
    const [version] = await client.accessSecretVersion({
      name: `${secretName}/versions/latest`,
    });

    if (!version.payload?.data) {
      return null;
    }

    return version.payload.data.toString();
  } catch (error: unknown) {
    // Secret doesn't exist or access denied
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 5 || error.code === 404)
    ) {
      return null;
    }
    throw error;
  }
}