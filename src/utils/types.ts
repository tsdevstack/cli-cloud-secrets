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
 * A secret an older CLI stored where the services no longer read it from,
 * and the scope it belongs to now
 */
export interface SecretMove {
  /** Framework key */
  key: string;
  /** Scope the secret belongs to now (its new copy is in this scope) */
  scope: string;
  /**
   * Scope in the old copy's name: shared for a secret that left the shared
   * scope; on Azure, the secret's own scope for a copy in the shared vault
   */
  oldScope: string;
}

/**
 * The place old copies are in: the environment's secret store (on Azure, the
 * shared vault)
 */
export interface OldSecretStore {
  /** The old copy's value, or null when there is none */
  read(key: string, oldScope: string): Promise<string | null>;
  /** Delete the old copy */
  remove(key: string, oldScope: string): Promise<void>;
}

/** Both copies of a moved secret */
export interface SecretCopies {
  move: SecretMove;
  /** Value of the old copy */
  oldValue: string;
  /** Value of the new copy, or null when it does not exist yet */
  newValue: string | null;
}

/**
 * Cloud secret operation result
 */
export interface CloudSecretResult {
  success: boolean;
  isNew: boolean;
  error?: string;
}
