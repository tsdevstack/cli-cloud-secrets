#!/usr/bin/env node

/**
 * Cloud Secrets: Delete the old copies of moved secrets
 *
 * After cloud-secrets:migrate copied the secrets an older CLI left in old
 * places, and a deploy switched the services to the new places, this command
 * deletes the old copies. An old copy whose new copy has the same value is
 * deleted after one question (skipped with --force). An old copy whose new
 * copy has a different value is deleted only after a second question, never
 * with --force. A copy not migrated yet is kept.
 *
 * Azure: Container Apps deployed by an older CLI read every scope from the
 * shared vault, where the old copies are. The command refuses while any is
 * still running.
 *
 * Usage:
 *   npx tsdevstack cloud-secrets:cleanup --env prod
 *   npx tsdevstack cloud-secrets:cleanup --env prod --force
 */

import { getContext } from '../context';
import type { CloudProvider } from '@tsdevstack/cli/plugin';
import inquirer from 'inquirer';
import { listSecretMoves } from '../utils/list-secret-moves';
import { createOldSecretStore } from '../utils/create-old-secret-store';
import { createSecretStoreReader } from '../utils/create-secret-store-reader';
import { readSecretCopies } from '../utils/read-secret-copies';
import { loadAzureCredentials } from '../utils/azure/load-azure-credentials';
import { listAppsWithoutOwnVault } from '../utils/azure/list-apps-without-own-vault';
import type { SecretCopies, SecretMove } from '../utils/types';

/**
 * Main cloud-secrets:cleanup command
 */
export async function cloudSecretsCleanup(options: {
  env?: string;
  force?: boolean;
}): Promise<void> {
  const {
    logger,
    CliError,
    findProjectRoot,
    loadFrameworkConfig,
    getAvailableEnvironments,
    resolveEnvironment,
  } = getContext();

  logger.info('Cloud Secrets: Delete the old copies of moved secrets');
  logger.newline();

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    throw new CliError(
      'Could not find project root (.tsdevstack/config.json)',
      'cloud-secrets:cleanup',
      'Run the command inside a tsdevstack project',
    );
  }

  const config = loadFrameworkConfig();
  const projectName = config.project.name;
  const provider = config.cloud?.provider as CloudProvider | 'local' | null;
  if (!provider || provider === 'local') {
    throw new CliError(
      'Cloud provider not configured in config.json',
      'cloud-secrets:cleanup',
      'Set cloud.provider to "gcp", "aws", or "azure" in .tsdevstack/config.json',
    );
  }

  const env = await resolveEnvironment(
    options,
    getAvailableEnvironments(projectRoot, provider),
    'cloud-secrets:cleanup',
  );

  logger.loading(`Provider: ${provider.toUpperCase()}`);
  logger.loading(`Project: ${projectName}`);
  logger.loading(`Environment: ${env}`);
  logger.newline();

  if (provider === 'azure') {
    const apps = await listAppsWithoutOwnVault(
      loadAzureCredentials(projectRoot, env),
      projectName,
      env,
    );
    if (apps.length > 0) {
      throw new CliError(
        `These Container Apps still read their secrets from the shared vault: ${apps.join(', ')}`,
        'cloud-secrets:cleanup',
        `Deploy them with this CLI first (npx tsdevstack infra:deploy --env ${env}); deleting the old copies now would break them`,
      );
    }
  }

  const target = { provider, projectRoot, projectName, env };
  const oldStore = createOldSecretStore(target);
  const copies = await readSecretCopies(
    await listSecretMoves({ ...target, config }),
    oldStore,
    createSecretStoreReader(target),
  );

  // Where the old copy is: on Azure, every old copy is in the shared vault
  const oldLabel = (move: SecretMove): string =>
    provider === 'azure'
      ? `${move.key} (${move.oldScope}, shared vault)`
      : `${move.key} (${move.oldScope})`;

  const deletable = copies.filter((copy) => copy.newValue === copy.oldValue);
  const notCopied = copies.filter((copy) => copy.newValue === null);
  const differing = copies.filter(
    (copy) => copy.newValue !== null && copy.newValue !== copy.oldValue,
  );

  if (notCopied.length > 0) {
    logger.warn('Kept, not copied yet (cloud-secrets:migrate copies them):');
    notCopied.forEach(({ move }) => logger.info(`   ${oldLabel(move)}`));
    logger.newline();
  }

  if (deletable.length === 0 && differing.length === 0) {
    logger.success('Nothing to delete');
    logger.newline();
    return;
  }

  const ask = async (message: string): Promise<boolean> => {
    const { confirm } = await inquirer.prompt([
      { type: 'confirm', name: 'confirm', message, default: false },
    ]);
    return confirm;
  };

  let deleted = 0;
  const removeAll = async (list: SecretCopies[]): Promise<void> => {
    for (const { move } of list) {
      await oldStore.remove(move.key, move.oldScope);
      logger.info(`   Deleted ${oldLabel(move)}`);
      deleted++;
    }
    logger.newline();
  };

  if (deletable.length > 0) {
    logger.info(
      `Old copies to delete (the new copy has the same value): ${deletable.length}`,
    );
    deletable.forEach(({ move }) =>
      logger.info(`   ${oldLabel(move)}, new copy in ${move.scope}`),
    );
    logger.newline();

    if (
      !options.force &&
      !(await ask(`Delete these ${deletable.length} old copies?`))
    ) {
      logger.info('Cancelled');
      return;
    }
    await removeAll(deletable);
  }

  // Asked on their own and never with --force: the old copy holds another
  // value, which a service deployed by an older CLI may still read
  if (differing.length > 0) {
    logger.warn(
      `Old copies whose new copy has a different value: ${differing.length}`,
    );
    differing.forEach(({ move }) =>
      logger.info(`   ${oldLabel(move)}, new copy in ${move.scope}`),
    );
    logger.newline();

    if (options.force) {
      logger.info('Kept: --force never deletes these');
      logger.newline();
    } else {
      logger.info(
        'Services deployed with this CLI read the new copy; a service deployed by an older CLI may still read the old one',
      );
      if (await ask(`Delete these ${differing.length} old copies too?`)) {
        await removeAll(differing);
      } else {
        logger.info('Kept');
        logger.newline();
      }
    }
  }

  logger.complete(`Deleted ${deleted} old copies`);
  logger.newline();
}
