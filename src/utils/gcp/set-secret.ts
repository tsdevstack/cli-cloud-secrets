import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import type { CloudSecretResult } from '../types';
import { secretExists } from './secret-exists';

/**
 * Set or update a secret in GCP Secret Manager
 *
 * Creates the secret if it doesn't exist, then adds a new version with the provided value.
 */
export async function setSecret(
  client: SecretManagerServiceClient,
  projectId: string,
  projectName: string,
  secretName: string,
  value: string,
): Promise<CloudSecretResult> {
  try {
    const parent = `projects/${projectId}`;
    const secretId = secretName;

    // Check if secret exists
    const exists = await secretExists(client, projectId, secretId);

    if (!exists) {
      // Create new secret with labels
      await client.createSecret({
        parent,
        secretId,
        secret: {
          replication: {
            automatic: {},
          },
          labels: {
            'project-name': projectName,
            'managed-by': 'tsdevstack',
            'secret-type': 'user',
          },
        },
      });
    }

    // Add new version with the value
    await client.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: {
        data: Buffer.from(value, 'utf8'),
      },
    });

    return { success: true, isNew: !exists };
  } catch (error) {
    return {
      success: false,
      isNew: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}