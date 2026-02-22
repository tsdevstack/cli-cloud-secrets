/**
 * CommandContext interface for cli-cloud-secrets
 *
 * Re-exports types from cli-core plugin interface.
 */

// Re-export all types from cli-core plugin
export type {
  FrameworkConfig,
  FrameworkService,
  CloudConfig,
  Environments,
  SecretsFile,
  Secrets,
  Logger,
  CliErrorClass,
  CliErrorInstance,
  WrapCommand,
  CloudProvider,
  CloudProviders,
  GCPCredentials,
  AWSCredentials,
  AzureCredentials,
} from 'tsdevstack/plugin';

// Import types needed for CommandContext definition
import type {
  Logger,
  CliErrorClass,
  WrapCommand,
  FrameworkConfig,
  SecretsFile,
  CloudProvider,
} from 'tsdevstack/plugin';

/**
 * CommandContext - all utilities injected from cli-core
 */
export interface CommandContext {
  // Logger
  logger: Logger;

  // Config
  loadFrameworkConfig: () => FrameworkConfig;

  // File system
  readJsonFile: <T = unknown>(path: string) => T;
  writeJsonFile: (path: string, data: unknown) => void;

  // Paths
  findProjectRoot: (startDir?: string, maxDepth?: number) => string;
  getConfigPath: (root?: string) => string;

  // Constants
  TSDEVSTACK_DIR: string;

  // Secrets utilities
  generateFrameworkSecretsFile: (
    config: FrameworkConfig,
    existingFrameworkSecrets?: SecretsFile | null,
  ) => SecretsFile;
  loadUserSecrets: (rootDir?: string) => SecretsFile | null;
  loadFrameworkSecrets: (rootDir?: string) => SecretsFile | null;
  generateServiceUrls: (
    config: FrameworkConfig,
    existingSecrets?: Record<string, string>,
    environment?: 'local' | 'cloud',
  ) => Record<string, string>;

  // Errors
  CliError: CliErrorClass;
  wrapCommand: WrapCommand;

  // Cloud utilities
  getCredentialsPath: (projectRoot: string, provider: CloudProvider) => string;
  loadCredentialsFile: (
    projectRoot: string,
    provider: CloudProvider,
  ) => Record<string, unknown>;
  getAvailableEnvironments: (
    projectRoot: string,
    provider: CloudProvider,
  ) => string[];
  validateDuplicateCredentials: (
    allCredentials: Record<string, unknown>,
    provider: CloudProvider,
  ) => void;
}
