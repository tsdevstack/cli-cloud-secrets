/**
 * Create Old Secret Store
 *
 * Reads and deletes the copies an older CLI left where the services no
 * longer read them from (see listSecretMoves).
 */

import { getContext } from '../context';
import { createSecretStoreReader } from './create-secret-store-reader';
import { removeSecretByName as removeGCPSecretByName } from './gcp/remove-secret-by-name';
import { removeSecretByName as removeAWSSecretByName } from './aws/remove-secret-by-name';
import { loadAzureCredentials } from './azure/load-azure-credentials';
import { createAzureClient } from './azure/create-azure-client';
import { getSecret as getSecretAzure } from './azure/get-secret';
import { removeSecretByName as removeAzureSecretByName } from './azure/remove-secret-by-name';
import { transformSecretNameForAzure } from './azure/transform-secret-name-for-azure';
import type { CloudProvider, OldSecretStore } from './types';

/**
 * Create the store of one environment's old copies: the environment's secret
 * store on GCP and AWS, the shared vault on Azure (where an older CLI kept
 * every scope)
 *
 * @param options.provider - Cloud provider from config.json
 * @param options.projectRoot - Project root (credentials file location)
 * @param options.projectName - Project name (secret name prefix)
 * @param options.env - Target environment
 * @returns Store whose methods take a framework key and the old copy's scope
 */
export function createOldSecretStore(options: {
  provider: CloudProvider;
  projectRoot: string;
  projectName: string;
  env: string;
}): OldSecretStore {
  const { buildSecretName, CliError } = getContext();
  const { provider, projectRoot, projectName, env } = options;

  const nameFor = (key: string, oldScope: string): string =>
    buildSecretName(projectName, oldScope, key);

  const removed = (
    name: string,
    result: { success: boolean; error?: string },
  ): void => {
    if (!result.success) {
      throw new CliError(
        `Failed to delete ${name}: ${result.error}`,
        'Old secret copy',
        'Check that your credentials can delete secrets in this environment',
      );
    }
  };

  if (provider === 'azure') {
    const client = createAzureClient(
      loadAzureCredentials(projectRoot, env),
      projectName,
      env,
    );
    return {
      read: (key, oldScope) =>
        getSecretAzure(
          client,
          transformSecretNameForAzure(nameFor(key, oldScope)),
        ),
      remove: async (key, oldScope) => {
        const name = nameFor(key, oldScope);
        // Without a scope, the shared vault
        removed(
          name,
          await removeAzureSecretByName(projectRoot, env, projectName, name),
        );
      },
    };
  }

  const reader = createSecretStoreReader(options);
  const removeByName =
    provider === 'gcp' ? removeGCPSecretByName : removeAWSSecretByName;
  return {
    read: (key, oldScope) => reader.read(key, oldScope),
    remove: async (key, oldScope) => {
      const name = nameFor(key, oldScope);
      removed(name, await removeByName(projectRoot, env, name));
    },
  };
}
