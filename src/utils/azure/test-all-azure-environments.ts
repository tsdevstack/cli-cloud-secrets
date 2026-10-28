/**
 * Test all Azure environments from credentials file
 */

import { getContext } from '../../context';
import { createAzureClient } from './create-azure-client';
import type { AzureCredentials } from '../types';
import type { EnvTestResult } from '../types';

export async function testAllAzureEnvironments(
  projectRoot: string,
): Promise<EnvTestResult[]> {
  try {
    const { loadCredentialsFile, loadFrameworkConfig, buildKeyVaultName } =
      getContext();
    const allCredentials = loadCredentialsFile(projectRoot, 'azure');
    const config = loadFrameworkConfig();
    const projectName = config.project.name;
    const results: EnvTestResult[] = [];

    for (const [env, credentials] of Object.entries(allCredentials)) {
      try {
        const azureCredentials = credentials as AzureCredentials;
        const keyVaultName = buildKeyVaultName(projectName, env);

        // Read the first page of the shared vault's secrets, like the GCP
        // and AWS tests. Listing vaults would pass without a Key Vault data
        // role, and push then fails on every secret.
        const client = createAzureClient(azureCredentials, projectName, env);
        await client
          .listPropertiesOfSecrets()
          .byPage({ maxPageSize: 1 })
          .next();

        results.push({
          env,
          valid: true,
          projectId: keyVaultName,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        const forbidden =
          (error as { statusCode?: number } | null)?.statusCode === 403;
        results.push({
          env,
          valid: false,
          error: forbidden
            ? `${message}\n  Hint: give the service principal Key Vault Secrets Officer on the resource group (Azure account setup, Step 5). Key Vault Secrets User can only read. A new role assignment can take up to 10 minutes to apply.`
            : message,
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
