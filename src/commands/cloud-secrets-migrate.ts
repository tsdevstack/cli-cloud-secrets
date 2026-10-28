#!/usr/bin/env node

/**
 * Cloud Secrets: Copy secrets to the places the services read them from
 *
 * An older CLI kept some secrets where the services no longer read them:
 * - every provider: the auth secrets in shared (they belong to the
 *   auth-service scope now);
 * - Azure: every service's secrets in the shared vault (each backend service
 *   has its own vault now).
 *
 * This command copies each one to its new place. It never deletes and never
 * overwrites: a new copy with a different value is reported and left as it
 * is. Safe to run again.
 *
 * Usage:
 *   npx tsdevstack cloud-secrets:migrate --env prod
 */

import { getContext } from '../context';
import type { CloudProvider } from '@tsdevstack/cli/plugin';
import { cloudSecretsSet } from './cloud-secrets-set';
import { listSecretMoves } from '../utils/list-secret-moves';
import { createOldSecretStore } from '../utils/create-old-secret-store';
import { createSecretStoreReader } from '../utils/create-secret-store-reader';
import { readSecretCopies } from '../utils/read-secret-copies';

/**
 * Main cloud-secrets:migrate command
 */
export async function cloudSecretsMigrate(options: {
  env?: string;
}): Promise<void> {
  const {
    logger,
    CliError,
    findProjectRoot,
    loadFrameworkConfig,
    getAvailableEnvironments,
    resolveEnvironment,
  } = getContext();

  logger.info('Cloud Secrets: Copy secrets to their new places');
  logger.newline();

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    throw new CliError(
      'Could not find project root (.tsdevstack/config.json)',
      'cloud-secrets:migrate',
      'Run the command inside a tsdevstack project',
    );
  }

  const config = loadFrameworkConfig();
  const projectName = config.project.name;
  const provider = config.cloud?.provider as CloudProvider | 'local' | null;
  if (!provider || provider === 'local') {
    throw new CliError(
      'Cloud provider not configured in config.json',
      'cloud-secrets:migrate',
      'Set cloud.provider to "gcp", "aws", or "azure" in .tsdevstack/config.json',
    );
  }

  const env = await resolveEnvironment(
    options,
    getAvailableEnvironments(projectRoot, provider),
    'cloud-secrets:migrate',
  );

  logger.loading(`Provider: ${provider.toUpperCase()}`);
  logger.loading(`Project: ${projectName}`);
  logger.loading(`Environment: ${env}`);
  logger.newline();

  // Every value is read before anything is written
  const target = { provider, projectRoot, projectName, env };
  const copies = await readSecretCopies(
    await listSecretMoves({ ...target, config }),
    createOldSecretStore(target),
    createSecretStoreReader(target),
  );

  if (copies.length === 0) {
    logger.success('Nothing to copy: no secret is left in an old place');
    logger.newline();
    return;
  }

  // Two old copies can have one new place (the first one is copied)
  const written = new Map<string, string>();
  let copied = 0;
  let inPlace = 0;
  let conflicts = 0;

  for (const { move, oldValue, newValue } of copies) {
    const label = `${move.key} (${move.scope})`;
    const destination = `${move.scope}/${move.key}`;
    const current = newValue ?? written.get(destination) ?? null;

    if (current === oldValue) {
      logger.info(`   ${label}: already in place`);
      inPlace++;
      continue;
    }

    if (current !== null) {
      logger.warn(
        `   ${label}: the new copy has a different value, left as it is`,
      );
      conflicts++;
      continue;
    }

    await cloudSecretsSet(move.key, undefined, {
      value: oldValue,
      env,
      service: move.scope,
      overwrite: false,
      internal: true,
    });
    written.set(destination, oldValue);
    logger.info(`   ${label}: copied`);
    copied++;
  }

  logger.newline();
  logger.summary('Summary:');
  logger.info(`   Copied: ${copied}`);
  logger.info(`   Already in place: ${inPlace}`);
  if (conflicts > 0) {
    logger.warn(`   Different values: ${conflicts}`);
    logger.info(
      '   Services deployed with this CLI read the new copy; cleanup keeps old copies that differ',
    );
  }
  logger.newline();
}
