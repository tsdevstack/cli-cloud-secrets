/**
 * List the Container Apps that still read every scope from the shared vault
 */

import { ContainerAppsAPIClient } from '@azure/arm-appcontainers';
import { getContext } from '../../context';
import type { AzureCredentials } from '../types';

/**
 * The project's Container Apps (services and workers) deployed before each
 * service had its own vault: they read Key Vault (they have the shared
 * vault's name) but not their own vault (no own vault name). Such a container
 * reads its secrets from the old copies in the shared vault.
 *
 * @param credentials - Azure credentials of the environment
 * @param projectName - Project name
 * @param env - Environment
 * @returns The apps' names; none when nothing is deployed yet
 */
export async function listAppsWithoutOwnVault(
  credentials: AzureCredentials,
  projectName: string,
  env: string,
): Promise<string[]> {
  const {
    createAzureCredential,
    CliError,
    AZURE_KEYVAULT_NAME_ENV,
    AZURE_SERVICE_KEYVAULT_NAME_ENV,
  } = getContext();

  const client = new ContainerAppsAPIClient(
    createAzureCredential(credentials),
    credentials.subscriptionId,
  );

  const appNames: string[] = [];
  try {
    for await (const app of client.containerApps.listByResourceGroup(
      `${projectName}-${env}-rg`,
    )) {
      if (!app.name?.startsWith(`${projectName}-`)) {
        continue;
      }
      const envNames = new Set(
        (app.template?.containers ?? []).flatMap((container) =>
          (container.env ?? []).map((entry) => entry.name),
        ),
      );
      if (
        envNames.has(AZURE_KEYVAULT_NAME_ENV) &&
        !envNames.has(AZURE_SERVICE_KEYVAULT_NAME_ENV)
      ) {
        appNames.push(app.name);
      }
    }
  } catch (error) {
    // The only 404 of a list in a resource group: the group does not exist,
    // so nothing is deployed in this environment
    if ((error as { statusCode?: number })?.statusCode === 404) {
      return [];
    }
    throw new CliError(
      `Could not check the deployed Container Apps: ${error instanceof Error ? error.message : String(error)}`,
      'cloud-secrets:cleanup',
      'Check that your Azure credentials can read the Container Apps of this environment',
    );
  }

  return appNames;
}
