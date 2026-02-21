import { SecretClient } from '@azure/keyvault-secrets';
import { createAzureCredential } from './create-azure-credential';
import type { AzureCredentials } from '../types';
import { buildKeyVaultName } from './build-key-vault-name';

/**
 * Create Azure SecretClient from credentials
 * Key Vault name is derived from project name and environment
 */
export function createAzureClient(
  credentials: AzureCredentials,
  projectName: string,
  env: string,
): SecretClient {
  const credential = createAzureCredential(credentials);

  const keyVaultName = buildKeyVaultName(projectName, env);
  const vaultUrl = `https://${keyVaultName}.vault.azure.net`;
  return new SecretClient(vaultUrl, credential);
}
