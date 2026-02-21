/**
 * Ensure Key Vault exists, creating it if necessary
 *
 * Prerequisites: Resource group must already exist (created by user in Azure portal).
 * Uses RBAC authorization — the SP's "Key Vault Secrets Officer" role on the RG
 * is inherited by the Key Vault automatically.
 */

import { createAzureCredential } from './create-azure-credential';
import { KeyVaultManagementClient } from '@azure/arm-keyvault';
import type { AzureCredentials } from '../types';
import { buildKeyVaultName } from './build-key-vault-name';

export async function ensureKeyVaultExists(
  projectName: string,
  env: string,
  azureCredentials: AzureCredentials,
): Promise<{ exists: boolean; created: boolean; error?: string }> {
  try {
    const resourceGroupName = `${projectName}-${env}-rg`;
    const keyVaultName = buildKeyVaultName(projectName, env);
    const location = azureCredentials.location;

    // Step 1: Create Key Vault Management Client
    const credential = createAzureCredential(azureCredentials);

    const kvManagementClient = new KeyVaultManagementClient(
      credential,
      azureCredentials.subscriptionId,
    );

    // Step 2: Check if Key Vault already exists
    try {
      await kvManagementClient.vaults.get(resourceGroupName, keyVaultName);
      return { exists: true, created: false };
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode !== 404) {
        throw error;
      }
      // Key Vault doesn't exist, create it
    }

    // Step 3: Create the Key Vault with RBAC authorization
    const vaultParameters = {
      location,
      properties: {
        sku: {
          family: 'A' as const,
          name: 'standard' as const,
        },
        tenantId: azureCredentials.tenantId,
        accessPolicies: [],
        enabledForDeployment: false,
        enabledForDiskEncryption: false,
        enabledForTemplateDeployment: false,
        enableSoftDelete: true,
        softDeleteRetentionInDays: 90,
        enableRbacAuthorization: true,
      },
      tags: {
        'managed-by': 'tsdevstack',
        project: projectName,
        environment: env,
      },
    };

    await kvManagementClient.vaults.beginCreateOrUpdateAndWait(
      resourceGroupName,
      keyVaultName,
      vaultParameters,
    );

    return { exists: true, created: true };
  } catch (error: unknown) {
    return {
      exists: false,
      created: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error creating Key Vault',
    };
  }
}
