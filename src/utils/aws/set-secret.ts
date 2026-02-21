import {
  SecretsManagerClient,
  CreateSecretCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import type { CloudSecretResult } from '../types';
import { secretExists } from './secret-exists';

/**
 * Set or update a secret in AWS Secrets Manager
 *
 * Creates the secret if it doesn't exist, then updates it with the provided value.
 */
export async function setSecret(
  client: SecretsManagerClient,
  projectName: string,
  secretName: string,
  value: string
): Promise<CloudSecretResult> {
  try {
    // Check if secret exists
    const exists = await secretExists(client, secretName);

    if (!exists) {
      // Create new secret with tags
      await client.send(
        new CreateSecretCommand({
          Name: secretName,
          SecretString: value,
          Tags: [
            { Key: 'project-name', Value: projectName },
            { Key: 'managed-by', Value: 'tsdevstack' },
            { Key: 'secret-type', Value: 'user' },
          ],
        })
      );
    } else {
      // Update existing secret
      await client.send(
        new PutSecretValueCommand({
          SecretId: secretName,
          SecretString: value,
        })
      );
    }

    return { success: true, isNew: !exists };
  } catch (error) {
    return {
      success: false,
      isNew: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}