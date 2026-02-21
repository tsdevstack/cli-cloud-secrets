import { SecretsManagerClient, DeleteSecretCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Remove secret from AWS Secrets Manager
 *
 * Note: AWS schedules deletion with a recovery window (default 30 days).
 * Use ForceDeleteWithoutRecovery for immediate deletion if needed.
 */
export async function removeSecret(
  client: SecretsManagerClient,
  secretId: string,
  forceDelete: boolean = false
): Promise<void> {
  await client.send(
    new DeleteSecretCommand({
      SecretId: secretId,
      ForceDeleteWithoutRecovery: forceDelete,
      RecoveryWindowInDays: forceDelete ? undefined : 7, // 7-day recovery window
    })
  );
}