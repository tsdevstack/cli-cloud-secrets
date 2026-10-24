/**
 * Cloud-secrets specific types
 */

// Re-export shared types from cli-core plugin
export type {
  CloudProvider,
  GCPCredentials,
  AWSCredentials,
  AzureCredentials,
} from '@tsdevstack/cli/plugin';

/**
 * Environment test result
 */
export interface EnvTestResult {
  env: string;
  valid: boolean;
  projectId?: string; // GCP
  accountId?: string; // AWS
  error?: string;
}

/**
 * Reads one environment's secret store by framework key and scope
 * (scope defaults to shared)
 */
export interface SecretStoreReader {
  /** Whether the secret exists */
  exists(key: string, scope?: string): Promise<boolean>;
  /** The secret's value, or null when it does not exist */
  read(key: string, scope?: string): Promise<string | null>;
}

/**
 * Cloud secret operation result
 */
export interface CloudSecretResult {
  success: boolean;
  isNew: boolean;
  error?: string;
}
