import { loadAzureCredentials } from './load-azure-credentials';
import { createAzureClient } from './create-azure-client';
import { listSecrets } from './list-secrets';
import { parseAzureSecretName } from './parse-azure-secret-name';
import type { ExtractedSecret } from '../extract-key-and-scope-from-secret-name';
import { getContext } from '../../context';

/**
 * List secret keys from Azure Key Vault
 * Returns array of extracted secrets with key and scope
 */
export async function listSecretsWithKeys(
  projectRoot: string,
  selectedEnv: string,
  projectName: string,
): Promise<ExtractedSecret[]> {
  try {
    const credentials = loadAzureCredentials(projectRoot, selectedEnv);
    const client = createAzureClient(credentials, projectName, selectedEnv);
    const secretsMap = await listSecrets(client, projectName);

    // Extract keys and scopes from secret names (format: projectName-scope-KEY)
    // Azure stores keys with hyphens (DATABASE-URL); the parser converts them
    // back to underscores (DATABASE_URL), matching the runtime behavior in
    // packages/nest-common/src/secrets/providers/azure.provider.ts
    const extractedSecrets: ExtractedSecret[] = [];
    for (const secretName of Object.keys(secretsMap)) {
      const extracted = parseAzureSecretName(secretName, projectName);
      if (extracted) {
        extractedSecrets.push(extracted);
      }
    }

    return extractedSecrets;
  } catch (error) {
    const { CliError } = getContext();
    throw new CliError(
      `Failed to list secrets from Azure: ${error instanceof Error ? error.message : String(error)}`,
      'Azure Secret List Error',
      'Check that your Azure credentials have the necessary permissions to list secrets',
    );
  }
}
