/**
 * Ensure resource group exists, creating it if necessary
 */

import { ResourceManagementClient } from '@azure/arm-resources';
import { getContext } from '../../context';
import type { AzureCredentials } from '../types';

export async function ensureResourceGroupExists(
  projectName: string,
  env: string,
  azureCredentials: AzureCredentials,
): Promise<{ exists: boolean; created: boolean; error?: string }> {
  try {
    const resourceGroupName = `${projectName}-${env}-rg`;
    const location = azureCredentials.location;

    // Create credentials and resource management client
    const { createAzureCredential } = getContext();
    const credential = createAzureCredential(azureCredentials);

    const resourceClient = new ResourceManagementClient(
      credential,
      azureCredentials.subscriptionId,
    );

    // Check if resource group exists
    try {
      await resourceClient.resourceGroups.get(resourceGroupName);
      return { exists: true, created: false };
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode !== 404) {
        throw error;
      }
      // Resource group doesn't exist, create it
    }

    // Create the resource group
    await resourceClient.resourceGroups.createOrUpdate(resourceGroupName, {
      location,
      tags: {
        'managed-by': 'tsdevstack',
        project: projectName,
        environment: env,
      },
    });

    return { exists: true, created: true };
  } catch (error: unknown) {
    return {
      exists: false,
      created: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error creating resource group',
    };
  }
}
