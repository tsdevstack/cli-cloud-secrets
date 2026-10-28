/**
 * Whether a secret exists only for local development
 */

import {
  LOCAL_ONLY_SECRET_KEYS,
  LOCAL_ONLY_SECRET_KEY_PATTERN,
} from '../constants';

/**
 * A local-only secret is never pushed to the cloud, and cloud-secrets:diff
 * does not expect it there
 *
 * @param key - Secret key
 * @returns Whether the key is local-only
 */
export function isLocalOnlySecret(key: string): boolean {
  return (
    (LOCAL_ONLY_SECRET_KEYS as readonly string[]).includes(key) ||
    LOCAL_ONLY_SECRET_KEY_PATTERN.test(key)
  );
}
