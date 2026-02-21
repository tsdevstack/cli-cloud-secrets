import type { GCPCredentials } from '../types';
import { getContext } from '../../context';

/**
 * Load GCP credentials for a specific environment
 *
 * Supports two modes:
 * - Local: Reads from .credentials.gcp.json file
 * - CI: Uses WIF/ADC via getGCPCredentialsFromEnv()
 */
export function loadGCPCredentials(
  projectRoot: string,
  env: string,
): GCPCredentials {
  const { loadCredentialsFile, CliError, isCIEnv, getGCPCredentialsFromEnv } = getContext();

  // In CI, use WIF/ADC credentials
  if (isCIEnv()) {
    return getGCPCredentialsFromEnv();
  }

  // Local: read from credentials file
  const credentialsFile = loadCredentialsFile(projectRoot, 'gcp');
  const credentials = credentialsFile[env];

  if (!credentials) {
    throw new CliError(
      `No credentials found for environment "${env}" in .credentials.gcp.json`,
      'GCP Credentials Error',
      'Run: npx tsdevstack cloud:init --gcp to set up GCP credentials'
    );
  }

  return credentials as GCPCredentials;
}