/**
 * Create Secret Store Reader
 *
 * Reads an environment's secret store (GCP Secret Manager, AWS Secrets
 * Manager or Azure Key Vault) by framework key and scope, so commands share
 * one place for the per-provider client setup and secret naming.
 */

import { getContext } from '../context';
import { loadGCPCredentials } from './gcp/load-gcp-credentials';
import { createGCPClient } from './gcp/client-factory';
import { secretExists as secretExistsGCP } from './gcp/secret-exists';
import { getSecret as getSecretGCP } from './gcp/get-secret';
import { loadAWSCredentials } from './aws/load-aws-credentials';
import { createAWSClient } from './aws/client-factory';
import { secretExists as secretExistsAWS } from './aws/secret-exists';
import { getSecret as getSecretAWS } from './aws/get-secret';
import { loadAzureCredentials } from './azure/load-azure-credentials';
import { createAzureClient } from './azure/create-azure-client';
import { secretExists as secretExistsAzure } from './azure/secret-exists';
import { getSecret as getSecretAzure } from './azure/get-secret';
import { transformKeyForAzure } from './azure/set-secret';
import type { CloudProvider, SecretStoreReader } from './types';

/**
 * Create a reader for one environment's secret store
 *
 * @param options.provider - Cloud provider from config.json
 * @param options.projectRoot - Project root (credentials file location)
 * @param options.projectName - Project name (secret name prefix)
 * @param options.env - Target environment
 * @returns Reader whose methods take a framework key and an optional scope (default: shared)
 */
export function createSecretStoreReader(options: {
  provider: CloudProvider;
  projectRoot: string;
  projectName: string;
  env: string;
}): SecretStoreReader {
  const { buildSecretName } = getContext();
  const { provider, projectRoot, projectName, env } = options;

  const nameFor = (key: string, scope = 'shared'): string =>
    buildSecretName(projectName, scope, key);

  if (provider === 'gcp') {
    const credentials = loadGCPCredentials(projectRoot, env);
    const client = createGCPClient(credentials);
    return {
      exists: (key, scope) =>
        secretExistsGCP(client, credentials.project_id, nameFor(key, scope)),
      read: (key, scope) =>
        getSecretGCP(
          client,
          `projects/${credentials.project_id}/secrets/${nameFor(key, scope)}`,
        ),
    };
  }

  if (provider === 'aws') {
    const credentials = loadAWSCredentials(projectRoot, env);
    const client = createAWSClient(credentials);
    return {
      exists: (key, scope) => secretExistsAWS(client, nameFor(key, scope)),
      read: (key, scope) => getSecretAWS(client, nameFor(key, scope)),
    };
  }

  const credentials = loadAzureCredentials(projectRoot, env);
  const client = createAzureClient(credentials, projectName, env);
  return {
    exists: (key, scope) =>
      secretExistsAzure(client, transformKeyForAzure(nameFor(key, scope))),
    read: (key, scope) =>
      getSecretAzure(client, transformKeyForAzure(nameFor(key, scope))),
  };
}
