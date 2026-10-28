/**
 * Plan the push of a framework secret that belongs to a service's scope
 */

import { getContext } from '../context';
import type { SecretStoreReader } from './types';

/** What cloud-secrets:push does with one service-scoped framework secret */
export type ScopedSecretPushPlan =
  | { action: 'skip' }
  | { action: 'copy'; value: string }
  | { action: 'create'; value: string };

/**
 * Decide the value of a framework secret that belongs to a service's scope
 * (the auth secrets: auth-service).
 *
 * An environment set up before the secret had its own scope holds it in
 * shared. That value is carried over, never replaced: new JWT keys or a new
 * refresh token secret would log every user out. The shared copy stays until
 * it is removed separately, after a deploy.
 *
 * @param store - Reader for the environment's secret store
 * @param key - Secret key
 * @param scope - The service scope the secret belongs to
 * @param generatedValue - Freshly generated value, for a new environment
 * @returns skip (already in its scope), copy (the shared value) or create
 */
export async function planScopedSecretPush(
  store: SecretStoreReader,
  key: string,
  scope: string,
  generatedValue: string,
): Promise<ScopedSecretPushPlan> {
  const { SHARED_SECRET_SCOPE } = getContext();

  if (await store.exists(key, scope)) {
    return { action: 'skip' };
  }

  const sharedValue = await store.read(key, SHARED_SECRET_SCOPE);
  if (sharedValue !== null) {
    return { action: 'copy', value: sharedValue };
  }

  return { action: 'create', value: generatedValue };
}
