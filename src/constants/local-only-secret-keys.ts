/**
 * Secrets that exist only for local development: generated into
 * .secrets.local.json but never pushed to the cloud (nothing reads them
 * there)
 */
export const LOCAL_ONLY_SECRET_KEYS = [
  'NODE_ENV',
  'SECRETS_PROVIDER',
  'KONG_SERVICE_HOST',
  // Local object storage (RustFS) connection; the cloud uses the provider's
  // own storage with the service's identity
  'STORAGE_ENDPOINT',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_FORCE_PATH_STYLE',
] as const;

/**
 * Local database usernames (DB_{SERVICE}_USERNAME): cloud databases name each
 * user after its service
 */
export const LOCAL_ONLY_SECRET_KEY_PATTERN = /^DB_[A-Z0-9_]+_USERNAME$/;
