import type { AzureCredentials } from '../types';
import { getContext } from '../../context';

/**
 * Load Azure credentials for a specific environment
 *
 * Supports two modes:
 * - Local: Reads from .credentials.azure.json file
 * - CI: Uses environment variables via getAzureCredentialsFromEnv()
 */
export function loadAzureCredentials(
  projectRoot: string,
  env: string,
): AzureCredentials {
  const { loadCredentialsFile, CliError, isCIEnv, getAzureCredentialsFromEnv } =
    getContext();

  // In CI, use environment variables (set by azure/login OIDC action)
  if (isCIEnv()) {
    return getAzureCredentialsFromEnv();
  }

  // Local: read from credentials file
  const allCredentials = loadCredentialsFile(projectRoot, 'azure');

  if (!(env in allCredentials)) {
    throw new CliError(
      `No credentials found for environment "${env}" in .tsdevstack/.credentials.azure.json`,
      'Azure Credentials Error',
      'Run: npx tsdevstack cloud:init --azure to set up Azure credentials',
    );
  }

  return allCredentials[env] as AzureCredentials;
}
