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
 * Cloud secret operation result
 */
export interface CloudSecretResult {
  success: boolean;
  isNew: boolean;
  error?: string;
}