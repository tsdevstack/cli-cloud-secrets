/**
 * Remove a secret by its full name from Azure Key Vault
 */

import { loadAzureCredentials } from './load-azure-credentials';
import { createAzureClient } from './create-azure-client';
import { getContext } from '../../context';
import { removeSecret } from './remove-secret';
import { transformSecretNameForAzure } from './transform-secret-name-for-azure';

/**
 * Remove a secret from the vault of its scope
 *
 * @param projectRoot - Project root (credentials file location)
 * @param selectedEnv - Target environment
 * @param projectName - Project name
 * @param secretName - Full secret name ({project}-{scope}-{KEY})
 * @param scope - 'shared' (default) or a service name: picks the vault
 * @returns success, or the error
 */
export async function removeSecretByName(
  projectRoot: string,
  selectedEnv: string,
  projectName: string,
  secretName: string,
  scope?: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { keyVaultExists, SHARED_SECRET_SCOPE } = getContext();
    const credentials = loadAzureCredentials(projectRoot, selectedEnv);
    // A service's vault may not exist yet: its secrets cannot either
    if (
      scope &&
      scope !== SHARED_SECRET_SCOPE &&
      !(await keyVaultExists(credentials, projectName, selectedEnv, scope))
    ) {
      return { success: false, error: `Secret ${secretName} not found` };
    }
    const client = createAzureClient(
      credentials,
      projectName,
      selectedEnv,
      scope,
    );
    const azureSecretName = transformSecretNameForAzure(secretName);
    await removeSecret(client, azureSecretName);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
