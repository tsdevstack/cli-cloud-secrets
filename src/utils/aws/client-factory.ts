/**
 * AWS client factory
 */

import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { AWSCredentials } from '../types';

/**
 * Create AWS Secrets Manager client with credentials
 */
export function createAWSClient(
  credentials: AWSCredentials,
): SecretsManagerClient {
  return new SecretsManagerClient({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken
        ? { sessionToken: credentials.sessionToken }
        : {}),
    },
  });
}
