/**
 * List the user secrets that belong to a backend service's own scope
 */

import { isLocalOnlySecret } from './is-local-only-secret';
import type { FrameworkConfig, SecretsFile } from '@tsdevstack/cli/plugin';

/** A user secret in a service's section of .secrets.user.json */
export interface ServiceUserSecret {
  key: string;
  /** The service whose scope it belongs to */
  scope: string;
  /** Local value (push asks for each environment's own value) */
  value: string;
}

/**
 * The values in backend services' sections of .secrets.user.json: each
 * belongs to that service's scope, where only that service reads it. Left
 * out: the `secrets` array, metadata (`$...`), DATABASE_URL (written by
 * infra:deploy) and local-only values.
 *
 * @param userSecretsFile - Parsed .secrets.user.json
 * @param config - Framework config (which sections are backend services)
 * @returns One entry per value, in file order
 */
export function listServiceUserSecrets(
  userSecretsFile: SecretsFile,
  config: FrameworkConfig,
): ServiceUserSecret[] {
  const backendServices = new Set(
    config.services
      .filter((service) => service.type === 'nestjs')
      .map((service) => service.name),
  );

  const entries: ServiceUserSecret[] = [];
  for (const [section, content] of Object.entries(userSecretsFile)) {
    if (
      !backendServices.has(section) ||
      !content ||
      typeof content !== 'object' ||
      Array.isArray(content)
    ) {
      continue;
    }
    for (const [key, value] of Object.entries(content)) {
      if (
        typeof value !== 'string' ||
        key === 'secrets' ||
        key.startsWith('$') ||
        key === 'DATABASE_URL' ||
        isLocalOnlySecret(key)
      ) {
        continue;
      }
      entries.push({ key, scope: section, value });
    }
  }
  return entries;
}
