/**
 * Register Azure Resource Providers
 *
 * Checks every resource provider a tsdevstack environment needs
 * (AZURE_REQUIRED_RESOURCE_PROVIDERS) and registers the ones that are not,
 * so registration (a few minutes) runs before the first deploy needs it.
 * Registering needs subscription-level rights; without them the result
 * names the unregistered providers and how to register them by hand.
 */

import { getContext } from '../../context';
import { ResourceManagementClient } from '@azure/arm-resources';
import type { AzureCredentials } from '../types';

export interface RegisterResourceProvidersResult {
  success: boolean;
  /** Providers this call asked Azure to register */
  registering: string[];
  /** Providers still unregistered after a failure */
  unregistered: string[];
  error?: string;
}

export async function registerResourceProviders(
  azureCredentials: AzureCredentials,
): Promise<RegisterResourceProvidersResult> {
  const { AZURE_REQUIRED_RESOURCE_PROVIDERS, createAzureCredential } =
    getContext();
  const unregistered: string[] = [];
  const registering: string[] = [];

  try {
    const credential = createAzureCredential(azureCredentials);
    const resourceClient = new ResourceManagementClient(
      credential,
      azureCredentials.subscriptionId,
    );

    for (const provider of AZURE_REQUIRED_RESOURCE_PROVIDERS) {
      const info = await resourceClient.providers.get(provider);
      if (info.registrationState !== 'Registered') {
        unregistered.push(provider);
      }
    }

    for (const provider of unregistered) {
      await resourceClient.providers.register(provider);
      registering.push(provider);
    }

    return { success: true, registering, unregistered: [] };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error registering providers';
    const missing = unregistered.filter((p) => !registering.includes(p));

    if (message.includes('does not have authorization')) {
      return {
        success: false,
        registering,
        unregistered: missing,
        error: [
          `Not allowed to register Azure resource providers in subscription ${azureCredentials.subscriptionId}.`,
          `Not registered: ${missing.join(', ')}`,
          'Register them once from an account with access to the subscription:',
          '  Azure Portal: Subscriptions → (your subscription) → Settings → Resource providers → select each one → Register',
          `  Azure CLI: az provider register --subscription ${azureCredentials.subscriptionId} --namespace <name>`,
          'Or give the service principal the Contributor role on the subscription (not only on a resource group).',
        ].join('\n'),
      };
    }

    return {
      success: false,
      registering,
      unregistered: missing,
      error: message,
    };
  }
}
