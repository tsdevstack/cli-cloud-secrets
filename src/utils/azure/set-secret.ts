import type { SecretClient } from '@azure/keyvault-secrets';
import type { CloudSecretResult } from '../types';
import { secretExists } from './secret-exists';

/**
 * Transform key to Azure-compliant format
 * Azure Key Vault only allows alphanumeric and hyphens
 * DATABASE_URL -> DATABASE-URL
 */
export function transformKeyForAzure(key: string): string {
  return key.replace(/_/g, '-');
}

/**
 * Set or update a secret in Azure Key Vault with tags
 * Azure supports up to 15 tags per secret
 */
export async function setSecret(
  client: SecretClient,
  secretName: string,
  secretValue: string,
  tags: Record<string, string>
): Promise<CloudSecretResult> {
  try {
    // Check if secret already exists
    const exists = await secretExists(client, secretName);

    // Validate tag count (Azure limit: 15 tags)
    const tagCount = Object.keys(tags).length;
    if (tagCount > 15) {
      return {
        success: false,
        isNew: false,
        error: `Azure Key Vault supports maximum 15 tags (provided: ${tagCount})`,
      };
    }

    // Set the secret with tags
    await client.setSecret(secretName, secretValue, {
      tags,
    });

    return {
      success: true,
      isNew: !exists,
    };
  } catch (error: unknown) {
    return {
      success: false,
      isNew: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}