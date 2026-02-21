import type { AWSCredentials } from '../types';
import { getContext } from '../../context';

/**
 * Load AWS credentials for a specific environment
 *
 * Supports two modes:
 * - Local: Reads from .credentials.aws.json file
 * - CI: Uses environment variables via getAWSCredentialsFromEnv()
 */
export function loadAWSCredentials(
  projectRoot: string,
  env: string,
): AWSCredentials {
  const { loadCredentialsFile, CliError, isCIEnv, getAWSCredentialsFromEnv } =
    getContext();

  // In CI, use environment variables (set by aws-actions/configure-aws-credentials)
  if (isCIEnv()) {
    return getAWSCredentialsFromEnv();
  }

  // Local: read from credentials file
  const credentialsFile = loadCredentialsFile(projectRoot, 'aws');
  const credentials = credentialsFile[env];

  if (!credentials) {
    throw new CliError(
      `No credentials found for environment "${env}" in .credentials.aws.json`,
      'AWS Credentials Error',
      'Run: npx tsdevstack cloud:init --aws to set up AWS credentials',
    );
  }

  return credentials as AWSCredentials;
}
