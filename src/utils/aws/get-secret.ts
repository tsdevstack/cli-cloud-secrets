import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Get secret value from AWS Secrets Manager
 */
export async function getSecret(
  client: SecretsManagerClient,
  secretId: string
): Promise<string | null> {
  try {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretId })
    );
    return response.SecretString || null;
  } catch {
    return null;
  }
}