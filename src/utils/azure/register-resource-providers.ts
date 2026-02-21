/**
 * Register required Azure resource providers (e.g., Microsoft.KeyVault)
 */

import { createAzureCredential } from './create-azure-credential';
import { ResourceManagementClient } from '@azure/arm-resources';
import type { AzureCredentials } from '../types';

export async function registerResourceProviders(
  azureCredentials: AzureCredentials,
): Promise<{ success: boolean; error?: string }> {
  try {
    const credential = createAzureCredential(azureCredentials);

    const resourceClient = new ResourceManagementClient(
      credential,
      azureCredentials.subscriptionId,
    );

    // Register Microsoft.KeyVault provider
    await resourceClient.providers.register('Microsoft.KeyVault');

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error registering providers',
    };
  }
}
