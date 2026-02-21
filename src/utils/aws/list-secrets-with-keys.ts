import { loadAWSCredentials } from './load-aws-credentials';
import { createAWSClient } from './client-factory';
import { listSecrets } from './list-secrets';
import {
  extractKeyAndScopeFromSecretName,
  type ExtractedSecret,
} from '../extract-key-and-scope-from-secret-name';
import { getContext } from '../../context';

/**
 * List secret keys from AWS Secrets Manager
 * Returns array of extracted secrets with key and scope
 */
export async function listSecretsWithKeys(
  projectRoot: string,
  selectedEnv: string,
  projectName: string,
): Promise<ExtractedSecret[]> {
  try {
    const credentials = loadAWSCredentials(projectRoot, selectedEnv);
    const client = createAWSClient(credentials);
    const secretNames = await listSecrets(client, projectName);

    // Extract keys and scopes from secret names (format: projectName-scope-KEY)
    const extractedSecrets: ExtractedSecret[] = [];
    for (const secretName of secretNames) {
      const extracted = extractKeyAndScopeFromSecretName(
        secretName,
        projectName,
      );
      if (extracted) {
        extractedSecrets.push(extracted);
      }
    }

    return extractedSecrets;
  } catch (error) {
    const { CliError } = getContext();
    throw new CliError(
      `Failed to list secrets from AWS: ${error instanceof Error ? error.message : String(error)}`,
      'AWS Secret List Error',
      'Check that your AWS credentials have the necessary permissions to list secrets',
    );
  }
}
