import { SecretsManagerClient, DescribeSecretCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Check if secret exists in AWS Secrets Manager
 */
export async function secretExists(
  client: SecretsManagerClient,
  secretId: string
): Promise<boolean> {
  try {
    await client.send(new DescribeSecretCommand({ SecretId: secretId }));
    return true;
  } catch {
    return false;
  }
}