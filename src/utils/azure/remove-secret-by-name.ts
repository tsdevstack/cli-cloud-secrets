import { loadAzureCredentials } from './load-azure-credentials';
import { createAzureClient } from './create-azure-client';
import { removeSecret } from './remove-secret';
import { transformSecretNameForAzure } from './transform-secret-name-for-azure';

/**
 * Remove secret from Azure Key Vault by secret name
 */
export async function removeSecretByName(
  projectRoot: string,
  selectedEnv: string,
  projectName: string,
  secretName: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const credentials = loadAzureCredentials(projectRoot, selectedEnv);
    const client = createAzureClient(credentials, projectName, selectedEnv);

    // Transform secret name to Azure format (underscores → hyphens)
    const azureSecretName = transformSecretNameForAzure(secretName);
    await removeSecret(client, azureSecretName);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}