/**
 * Register Cloud Plugin Commands
 *
 * This module registers all cloud-related commands with the Commander.js program.
 * Called by cli-lib after context initialization.
 */

import type { Command } from 'commander';
import { cloudInit } from './commands/cloud-init';
import { cloudSecretsPush } from './commands/cloud-secrets-push';
import { cloudSecretsSet } from './commands/cloud-secrets-set';
import { cloudSecretsDiff } from './commands/cloud-secrets-diff';
import { cloudSecretsList } from './commands/cloud-secrets-list';
import { cloudSecretsRemove } from './commands/cloud-secrets-remove';
import { cloudSecretsGet } from './commands/cloud-secrets-get';
import { wrapCommand } from './context';

/**
 * Register all cloud commands with the CLI program
 *
 * @param program - Commander.js program instance
 */
export function registerCloudPlugin(program: Command): void {
  program
    .command('cloud:init')
    .description('Initialize cloud secrets provider integration')
    .option('--gcp', 'Use Google Cloud Platform')
    .option('--aws', 'Use Amazon Web Services')
    .option('--azure', 'Use Microsoft Azure')
    .action(
      wrapCommand(
        async (options: { gcp?: boolean; aws?: boolean; azure?: boolean }) => {
          let provider: string | undefined;
          if (options.gcp) provider = 'gcp';
          else if (options.aws) provider = 'aws';
          else if (options.azure) provider = 'azure';
          await cloudInit(provider);
        },
      ),
    );

  program
    .command('cloud-secrets:push')
    .description('Push secrets to cloud environment')
    .option('-e, --env <environment>', 'Target environment (dev/staging/prod)')
    .option(
      '--skip-user-secrets',
      'Skip user secrets (framework secrets only, for CI)',
    )
    .action(
      wrapCommand(
        async (options: { env?: string; skipUserSecrets?: boolean }) => {
          await cloudSecretsPush(options);
        },
      ),
    );

  program
    .command('cloud-secrets:diff')
    .description('Compare local and cloud secrets')
    .option('-e, --env <environment>', 'Target environment (dev/staging/prod)')
    .action(
      wrapCommand(async (options: { env?: string }) => {
        await cloudSecretsDiff(options.env);
      }),
    );

  program
    .command('cloud-secrets:set <key> [value]')
    .description('Set or update a secret in cloud environment')
    .option('-e, --env <environment>', 'Target environment (dev/staging/prod)')
    .option('-s, --service <service>', 'Service scope (defaults to shared)')
    .option('-v, --value <value>', 'Secret value (prompted if not provided)')
    .option('--overwrite', 'Overwrite existing secret without prompting')
    .action(
      wrapCommand(
        async (
          key: string,
          positionalValue: string | undefined,
          options: {
            value?: string;
            env?: string;
            service?: string;
            overwrite?: boolean;
          },
        ) => {
          await cloudSecretsSet(key, positionalValue, options);
        },
      ),
    );

  program
    .command('cloud-secrets:remove <key>')
    .description('Remove a secret from cloud environment')
    .option('-e, --env <environment>', 'Target environment (dev/staging/prod)')
    .option('-s, --service <service>', 'Service scope (defaults to shared)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(
      wrapCommand(
        async (
          key: string,
          options: { force?: boolean; env?: string; service?: string },
        ) => {
          await cloudSecretsRemove(key, options);
        },
      ),
    );

  program
    .command('cloud-secrets:list')
    .description('List all secrets in cloud environment')
    .option('-e, --env <environment>', 'Target environment (dev/staging/prod)')
    .option('--json', 'Output as JSON')
    .action(
      wrapCommand(async (options: { env?: string; json?: boolean }) => {
        await cloudSecretsList(options);
      }),
    );

  program
    .command('cloud-secrets:get <key>')
    .description('Get a secret value from cloud environment')
    .option('-e, --env <environment>', 'Target environment (dev/staging/prod)')
    .option('-s, --service <service>', 'Service scope (defaults to shared)')
    .option('--json', 'Output as JSON')
    .action(
      wrapCommand(
        async (
          key: string,
          options: { env?: string; json?: boolean; service?: string },
        ) => {
          await cloudSecretsGet(key, options);
        },
      ),
    );
}
