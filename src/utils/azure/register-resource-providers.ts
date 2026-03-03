/**
 * Register required Azure resource providers (e.g., Microsoft.KeyVault)
 *
 * Checks registration status first. Only attempts registration if needed.
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

    const info = await resourceClient.providers.get('Microsoft.KeyVault');
    if (info.registrationState === 'Registered') {
      return { success: true };
    }

    await resourceClient.providers.register('Microsoft.KeyVault');

    return { success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error registering providers';

    if (message.includes('does not have authorization')) {
      return {
        success: false,
        error: [
          'Insufficient permissions to register Microsoft.KeyVault provider.',
          'Provider registration requires subscription-level Contributor role (not resource group).',
          '',
          'Grant the Service Principal subscription-level Contributor, or register',
          'providers from an account with subscription access before running this command.',
        ].join('\n'),
      };
    }

    return {
      success: false,
      error: message,
    };
  }
}
