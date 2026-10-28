/**
 * List the places an older CLI may have left secrets in
 */

import { getContext } from '../context';
import { listSecretsWithKeys as listAzureSecretsWithKeys } from './azure/list-secrets-with-keys';
import type { CloudProvider, FrameworkConfig } from '@tsdevstack/cli/plugin';
import type { SecretMove } from './types';

/**
 * The secrets that may still be in an old place:
 * - every provider: the secrets of a service scope (the auth secrets), which
 *   an older CLI kept in shared;
 * - Azure: each backend service's secrets in the shared vault, since every
 *   backend service now has its own vault.
 *
 * A move says where an old copy would be, not that it exists. The moves out
 * of shared come first: services deployed by an older CLI read shared first,
 * so if two old copies of one secret differ, the value in use is copied.
 *
 * @param options.provider - Cloud provider from config.json
 * @param options.projectRoot - Project root (credentials file location)
 * @param options.projectName - Project name (secret name prefix)
 * @param options.env - Target environment
 * @param options.config - Framework config
 * @returns The moves, those out of shared first
 */
export async function listSecretMoves(options: {
  provider: CloudProvider;
  projectRoot: string;
  projectName: string;
  env: string;
  config: FrameworkConfig;
}): Promise<SecretMove[]> {
  const { AUTH_SERVICE_SECRETS, SHARED_SECRET_SCOPE, getSecretScope } =
    getContext();
  const { provider, projectRoot, projectName, env, config } = options;

  const moves: SecretMove[] = [];
  for (const key of AUTH_SERVICE_SECRETS) {
    const scope = getSecretScope(key, config);
    if (scope !== SHARED_SECRET_SCOPE) {
      moves.push({ key, scope, oldScope: SHARED_SECRET_SCOPE });
    }
  }

  if (provider === 'azure') {
    // The services that get their own vault (infra:generate)
    const backendServices = new Set(
      config.services
        .filter((service) => service.type === 'nestjs')
        .map((service) => service.name),
    );
    const sharedVault = await listAzureSecretsWithKeys(
      projectRoot,
      env,
      projectName,
    );
    for (const { key, scope } of sharedVault) {
      if (backendServices.has(scope)) {
        moves.push({ key, scope, oldScope: scope });
      }
    }
  }

  return moves;
}
