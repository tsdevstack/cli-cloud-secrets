/**
 * Test utilities for mocking the plugin context
 *
 * Usage in test files:
 *
 * ```typescript
 * import { rs } from '@rstest/core';
 * import { createMockContext, mockContextFactory } from '../test-utils/mock-context';
 *
 * // Create mocks at module level (BEFORE rs.mock, no rs.hoisted needed)
 * const mocks = createMockContext();
 *
 * rs.mock('../context', () => mockContextFactory(mocks));
 *
 * // In tests, use mocks.logger, mocks.findProjectRoot, etc.
 * ```
 */

import { rs } from '@rstest/core';

/**
 * Create all mock functions for the plugin context
 * Call at module level BEFORE rs.mock (no rs.hoisted needed)
 */
export function createMockContext() {
  const logger = {
    info: rs.fn(),
    error: rs.fn(),
    warn: rs.fn(),
    success: rs.fn(),
    debug: rs.fn(),
    newline: rs.fn(),
    generating: rs.fn(),
    reading: rs.fn(),
    loading: rs.fn(),
    checking: rs.fn(),
    running: rs.fn(),
    creating: rs.fn(),
    updating: rs.fn(),
    syncing: rs.fn(),
    validating: rs.fn(),
    building: rs.fn(),
    complete: rs.fn(),
    summary: rs.fn(),
    ready: rs.fn(),
  };

  const findProjectRoot = rs.fn();
  const getConfigPath = rs.fn();
  const loadFrameworkConfig = rs.fn();
  const readJsonFile = rs.fn();
  const writeJsonFile = rs.fn();
  const isFile = rs.fn();
  const ensureDirectory = rs.fn();
  const writeTextFile = rs.fn();
  const loadCredentialsFile = rs.fn();
  const validateDuplicateCredentials = rs.fn();
  const getAvailableEnvironments = rs.fn();
  const generateFrameworkSecretsFile = rs.fn();
  const loadUserSecrets = rs.fn();
  const loadFrameworkSecrets = rs.fn();
  const generateServiceUrls = rs.fn();
  const getCredentialsPath = rs.fn();
  const executeCommand = rs.fn();
  const buildSecretName = rs.fn();
  const isCIEnv = rs.fn(() => false); // Default to local mode
  const getGCPCredentialsFromEnv = rs.fn();
  const getAWSCredentialsFromEnv = rs.fn();
  const getAzureCredentialsFromEnv = rs.fn();
  const buildGCPClientOptions = rs.fn();

  // Mock CliError class
  class CliError extends Error {
    constructor(
      message: string,
      public context?: string,
      public hint?: string,
    ) {
      super(message);
      this.name = 'CliError';
    }
  }

  const wrapCommand = rs.fn(
    <T extends unknown[]>(fn: (...args: T) => Promise<void>) => fn,
  );

  return {
    logger,
    findProjectRoot,
    getConfigPath,
    loadFrameworkConfig,
    readJsonFile,
    writeJsonFile,
    isFile,
    ensureDirectory,
    writeTextFile,
    loadCredentialsFile,
    validateDuplicateCredentials,
    getAvailableEnvironments,
    generateFrameworkSecretsFile,
    loadUserSecrets,
    loadFrameworkSecrets,
    generateServiceUrls,
    getCredentialsPath,
    executeCommand,
    buildSecretName,
    isCIEnv,
    getGCPCredentialsFromEnv,
    getAWSCredentialsFromEnv,
    getAzureCredentialsFromEnv,
    buildGCPClientOptions,
    CliError,
    wrapCommand,
    TSDEVSTACK_DIR: '.tsdevstack',
    CLOUD_PROVIDERS: ['gcp', 'aws', 'azure'] as const,
  };
}

export type MockContext = ReturnType<typeof createMockContext>;

/**
 * Create the mock factory for rs.mock('../context', () => ...)
 */
export function mockContextFactory(mocks: MockContext) {
  return {
    initContext: rs.fn(),
    getContext: rs.fn(() => mocks),
    wrapCommand: mocks.wrapCommand,
  };
}
