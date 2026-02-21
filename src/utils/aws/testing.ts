/**
 * AWS environment testing utilities
 */

import type { EnvTestResult, AWSCredentials } from '../types';
import { createAWSClient } from './client-factory';
import { getContext } from '../../context';
import { ListSecretsCommand } from '@aws-sdk/client-secrets-manager';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

/**
 * Test AWS credentials for a specific environment
 */
export async function testAWSEnvironment(
  env: string,
  credentials: AWSCredentials,
): Promise<EnvTestResult> {
  try {
    if (!credentials.accountId) {
      return {
        env,
        valid: false,
        error: `Missing accountId in credentials for "${env}"`,
      };
    }

    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      return {
        env,
        valid: false,
        error: `Missing accessKeyId or secretAccessKey in credentials for "${env}"`,
      };
    }

    if (!credentials.region) {
      return {
        env,
        valid: false,
        error: `Missing region in credentials for "${env}"`,
      };
    }

    // Verify account ID matches actual credentials
    const stsClient = new STSClient({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });

    const identity = await stsClient.send(new GetCallerIdentityCommand({}));

    if (identity.Account !== credentials.accountId) {
      return {
        env,
        valid: false,
        error: `Account ID mismatch! Credentials belong to account ${identity.Account} but credentials file specifies ${credentials.accountId}`,
      };
    }

    // Create client and test connection to Secrets Manager
    const client = createAWSClient(credentials);

    // Try to list secrets (this will fail if credentials are invalid or lack permissions)
    await client.send(new ListSecretsCommand({ MaxResults: 1 }));

    return { env, valid: true, accountId: identity.Account };
  } catch (error) {
    return {
      env,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test all AWS environments from credentials file
 */
export async function testAllAWSEnvironments(
  projectRoot: string,
): Promise<EnvTestResult[]> {
  const { loadCredentialsFile } = getContext();
  const credentialsFile = loadCredentialsFile(projectRoot, 'aws');

  const envs = Object.keys(credentialsFile);
  if (envs.length === 0) {
    return [];
  }

  const results: EnvTestResult[] = [];
  for (const env of envs) {
    const result = await testAWSEnvironment(
      env,
      credentialsFile[env] as AWSCredentials,
    );
    results.push(result);
  }

  return results;
}