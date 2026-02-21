/**
 * Test all Azure environments from credentials file
 */

import { createAzureCredential } from './create-azure-credential';
import { KeyVaultManagementClient } from '@azure/arm-keyvault';
import { getContext } from '../../context';
import { buildKeyVaultName } from './build-key-vault-name';
import type { AzureCredentials } from '../types';
import type { EnvTestResult } from '../types';

export async function testAllAzureEnvironments(
  projectRoot: string,
): Promise<EnvTestResult[]> {
  try {
    const { loadCredentialsFile, loadFrameworkConfig } = getContext();
    const allCredentials = loadCredentialsFile(projectRoot, 'azure');
    const config = loadFrameworkConfig();
    const projectName = config.project.name;
    const results: EnvTestResult[] = [];

    for (const [env, credentials] of Object.entries(allCredentials)) {
      try {
        const azureCredentials = credentials as AzureCredentials;
        const keyVaultName = buildKeyVaultName(projectName, env);

        // Validate credentials by listing Key Vaults in the subscription
        // This works regardless of whether our specific Key Vault exists
        const credential = createAzureCredential(azureCredentials);

        const kvManagementClient = new KeyVaultManagementClient(
          credential,
          azureCredentials.subscriptionId,
        );

        // Test credentials by listing vaults (lightweight operation)
        // This validates: clientId, clientSecret, tenantId, and subscriptionId
        const iterator = kvManagementClient.vaults.list();
        await iterator.next();

        results.push({
          env,
          valid: true,
          projectId: keyVaultName,
        });
      } catch (error: unknown) {
        results.push({
          env,
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  } catch (error: unknown) {
    return [
      {
        env: 'unknown',
        valid: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load credentials file',
      },
    ];
  }
}
