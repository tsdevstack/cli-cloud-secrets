/**
 * Create Azure credential for SDK authentication
 *
 * Supports two modes:
 * - CI (OIDC): DefaultAzureCredential picks up azure/login session
 * - Local: ClientSecretCredential with explicit credentials
 */

import {
  ClientSecretCredential,
  DefaultAzureCredential,
} from '@azure/identity';
import type { TokenCredential } from '@azure/identity';
import { getContext } from '../../context';
import type { AzureCredentials } from '../types';

export function createAzureCredential(
  credentials: AzureCredentials,
): TokenCredential {
  const { isCIEnv, CliError } = getContext();

  if (isCIEnv()) {
    return new DefaultAzureCredential();
  }

  if (!credentials.clientSecret) {
    throw new CliError(
      'Azure client secret is required for local development',
      'credentials',
      'Ensure clientSecret is set in .tsdevstack/.credentials.azure.json',
    );
  }

  return new ClientSecretCredential(
    credentials.tenantId,
    credentials.clientId,
    credentials.clientSecret,
  );
}
