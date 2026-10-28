/**
 * List Azure secrets with extracted keys and scopes
 */

import { loadAzureCredentials } from './load-azure-credentials';
import { createAzureClient } from './create-azure-client';
import { listSecrets } from './list-secrets';
import { parseAzureSecretName } from './parse-azure-secret-name';
import type { ExtractedSecret } from '../extract-key-and-scope-from-secret-name';
import { getContext } from '../../context';

/**
 * List the project's secrets in the shared vault and in the vault of each
 * given service scope (a service without a vault has no secrets yet)
 *
 * @param projectRoot - Project root (credentials file location)
 * @param selectedEnv - Target environment
 * @param projectName - Project name (secret name prefix)
 * @param serviceScopes - Service names whose vaults to read too
 * @returns Every secret's key and scope
 */
export async function listSecretsWithKeys(
  projectRoot: string,
  selectedEnv: string,
  projectName: string,
  serviceScopes: string[] = [],
): Promise<ExtractedSecret[]> {
  try {
    const { keyVaultExists } = getContext();
    const credentials = loadAzureCredentials(projectRoot, selectedEnv);
    const extractedSecrets: ExtractedSecret[] = [];

    const scopes: Array<string | undefined> = [undefined];
    for (const scope of serviceScopes) {
      if (await keyVaultExists(credentials, projectName, selectedEnv, scope)) {
        scopes.push(scope);
      }
    }

    for (const scope of scopes) {
      const client = createAzureClient(
        credentials,
        projectName,
        selectedEnv,
        scope,
      );
      const secretsMap = await listSecrets(client, projectName);
      for (const secretName of Object.keys(secretsMap)) {
        const extracted = parseAzureSecretName(secretName, projectName);
        if (extracted) {
          extractedSecrets.push(extracted);
        }
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
