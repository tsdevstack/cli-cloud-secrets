/**
 * Transform secret name to Azure-compliant format
 * Azure Key Vault only allows alphanumeric and hyphens
 * tsdevstack-shared-DATABASE_URL → tsdevstack-shared-DATABASE-URL
 */
export function transformSecretNameForAzure(secretName: string): string {
  return secretName.replace(/_/g, '-');
}