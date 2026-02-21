import { SecretsManagerClient, ListSecretsCommand } from '@aws-sdk/client-secrets-manager';

/**
 * List all secrets for a project in AWS Secrets Manager
 * Filters by project-name tag
 */
export async function listSecrets(
  client: SecretsManagerClient,
  projectName: string
): Promise<string[]> {
  const secrets: string[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new ListSecretsCommand({
        Filters: [
          {
            Key: 'tag-key',
            Values: ['project-name'],
          },
          {
            Key: 'tag-value',
            Values: [projectName],
          },
        ],
        NextToken: nextToken,
      })
    );

    if (response.SecretList) {
      for (const secret of response.SecretList) {
        if (secret.Name) {
          secrets.push(secret.Name);
        }
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return secrets;
}