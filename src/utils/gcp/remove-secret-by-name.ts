import { loadGCPCredentials } from './load-gcp-credentials';
import { createGCPClient } from './client-factory';
import { removeSecret } from './remove-secret';

/**
 * Remove secret from GCP Secret Manager by secret name
 */
export async function removeSecretByName(
  projectRoot: string,
  selectedEnv: string,
  secretName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const credentials = loadGCPCredentials(projectRoot, selectedEnv);
    const client = createGCPClient(credentials);
    await removeSecret(client, credentials.project_id, secretName);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
