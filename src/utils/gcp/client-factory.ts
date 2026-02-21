/**
 * GCP client factory
 *
 * Supports two modes:
 * - Explicit credentials (local): private_key present in credentials
 * - ADC (CI with WIF): private_key absent, SDK auto-discovers credentials
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import type { GCPCredentials } from '../types';
import { getContext } from '../../context';

/**
 * Create GCP Secret Manager client
 *
 * @param credentials - GCP credentials (with or without private_key)
 */
export function createGCPClient(
  credentials: GCPCredentials,
): SecretManagerServiceClient {
  const { buildGCPClientOptions } = getContext();
  return new SecretManagerServiceClient(buildGCPClientOptions(credentials));
}