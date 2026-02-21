import type { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { extractKeyAndScopeFromSecretName, type ExtractedSecret } from '../extract-key-and-scope-from-secret-name';
import { getContext } from '../../context';

/**
 * List secrets from GCP Secret Manager with key and scope info
 */
export async function listSecretsWithKeys(
  client: SecretManagerServiceClient,
  projectId: string,
  projectName: string,
): Promise<ExtractedSecret[]> {
  try {
    const [secrets] = await client.listSecrets({
      parent: `projects/${projectId}`,
      filter: `labels.project-name=${projectName}`,
    });

    const extractedSecrets: ExtractedSecret[] = [];
    for (const secret of secrets) {
      if (secret.name) {
        const secretId = secret.name.split('/').pop();
        if (secretId) {
          const extracted = extractKeyAndScopeFromSecretName(secretId, projectName);
          if (extracted) {
            extractedSecrets.push(extracted);
          }
        }
      }
    }

    return extractedSecrets;
  } catch (error) {
    const { CliError } = getContext();
    throw new CliError(
      `Failed to list secrets from GCP: ${error instanceof Error ? error.message : String(error)}`,
      'GCP Secret List Error',
      'Check that your GCP credentials have the necessary permissions to list secrets'
    );
  }
}