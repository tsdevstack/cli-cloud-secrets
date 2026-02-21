/**
 * GCP environment testing utilities
 */

import type { EnvTestResult, GCPCredentials } from '../types';
import { createGCPClient } from './client-factory';
import { getContext } from '../../context';

/**
 * Test GCP credentials for a specific environment
 */
export async function testGCPEnvironment(
  env: string,
  credentials: GCPCredentials,
): Promise<EnvTestResult> {
  try {
    if (!credentials.project_id) {
      return {
        env,
        valid: false,
        error: `Missing project_id in credentials for "${env}"`,
      };
    }

    // Create client and test connection
    const client = createGCPClient(credentials);
    const projectId = credentials.project_id;

    // Try to list secrets (this will fail if credentials are invalid)
    await client.listSecrets({
      parent: `projects/${projectId}`,
    });

    return { env, valid: true, projectId };
  } catch (error) {
    return {
      env,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test all GCP environments from credentials file
 */
export async function testAllGCPEnvironments(
  projectRoot: string,
): Promise<EnvTestResult[]> {
  const { loadCredentialsFile } = getContext();
  const credentialsFile = loadCredentialsFile(projectRoot, 'gcp');

  const envs = Object.keys(credentialsFile);
  if (envs.length === 0) {
    return [];
  }

  const results: EnvTestResult[] = [];
  for (const env of envs) {
    const result = await testGCPEnvironment(
      env,
      credentialsFile[env] as GCPCredentials,
    );
    results.push(result);
  }

  return results;
}
