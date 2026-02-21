import { loadAWSCredentials } from './load-aws-credentials';
import { createAWSClient } from './client-factory';
import { removeSecret } from './remove-secret';

/**
 * Remove secret from AWS Secrets Manager by secret name
 */
export async function removeSecretByName(
  projectRoot: string,
  selectedEnv: string,
  secretName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const credentials = loadAWSCredentials(projectRoot, selectedEnv);
    const client = createAWSClient(credentials);
    await removeSecret(client, secretName);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}