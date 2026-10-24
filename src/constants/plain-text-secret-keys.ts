/**
 * Secret keys whose values are plain settings, not credentials: prompts show
 * them as typed (so a typo is visible). Every other value is masked.
 */
export const PLAIN_TEXT_SECRET_KEYS = [
  'DOMAIN',
  'EMAIL_FROM',
  'ADMIN_EMAILS',
] as const;
