/**
 * Create Azure Key Vault client
 */

import { SecretClient } from '@azure/keyvault-secrets';
import { getContext } from '../../context';
import type { AzureCredentials } from '../types';

/**
 * Create a Key Vault client for one secret scope of an environment: the
 * shared vault, or a service's own vault
 *
 * @param credentials - Azure credentials
 * @param projectName - Project name
 * @param env - Environment
 * @param scope - 'shared' (default) or a service name
 * @returns SecretClient for the scope's vault
 */
export function createAzureClient(
  credentials: AzureCredentials,
  projectName: string,
  env: string,
  scope?: string,
): SecretClient {
  const { buildKeyVaultName, createAzureCredential } = getContext();
  const credential = createAzureCredential(credentials);
  const keyVaultName = buildKeyVaultName(projectName, env, scope);
  const vaultUrl = `https://${keyVaultName}.vault.azure.net`;

  return new SecretClient(vaultUrl, credential);
}
