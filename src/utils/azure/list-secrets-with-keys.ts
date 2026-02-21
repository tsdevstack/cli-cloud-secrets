import { loadAzureCredentials } from './load-azure-credentials';
import { createAzureClient } from './create-azure-client';
import { listSecrets } from './list-secrets';
import { extractKeyFromSecretName } from '../extract-key-from-secret-name';
import { getContext } from '../../context';

/**
 * List secret keys from Azure Key Vault
 * Returns array of secret keys (extracted from secret names)
 */
export async function listSecretsWithKeys(
  projectRoot: string,
  selectedEnv: string,
  projectName: string,
): Promise<string[]> {
  try {
    const credentials = loadAzureCredentials(projectRoot, selectedEnv);
    const client = createAzureClient(credentials, projectName, selectedEnv);
    const secretsMap = await listSecrets(client, projectName);

    // Extract keys from secret names (format: projectName-shared-KEY)
    // IMPORTANT: Azure stores keys with hyphens (DATABASE-URL) but we convert back to underscores (DATABASE_URL)
    // This matches the runtime behavior in packages/nest-common/src/secrets/providers/azure.provider.ts
    const secretKeys: string[] = [];
    for (const secretName of Object.keys(secretsMap)) {
      const key = extractKeyFromSecretName(secretName, projectName);
      if (key) {
        // Reverse transform: DATABASE-URL → DATABASE_URL
        const transformedKey = key.replace(/-/g, '_');
        secretKeys.push(transformedKey);
      }
    }

    return secretKeys;
  } catch (error) {
    const { CliError } = getContext();
    throw new CliError(
      `Failed to list secrets from Azure: ${error instanceof Error ? error.message : String(error)}`,
      'Azure Secret List Error',
      'Check that your Azure credentials have the necessary permissions to list secrets'
    );
  }
}