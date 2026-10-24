/**
 * Prompt Secret Value
 *
 * Asks for a secret's value. Credentials are masked, so they never show on
 * screen (or in a recording or a shared terminal); plain settings
 * (PLAIN_TEXT_SECRET_KEYS) stay visible so a typo can be seen.
 */

import inquirer from 'inquirer';
import { PLAIN_TEXT_SECRET_KEYS } from '../constants';

export async function promptSecretValue(
  key: string,
  message: string,
): Promise<string> {
  const plain = (PLAIN_TEXT_SECRET_KEYS as readonly string[]).includes(key);
  const { value } = await inquirer.prompt<{ value: string }>([
    plain
      ? { type: 'input', name: 'value', message }
      : { type: 'password', name: 'value', message, mask: '*' },
  ]);
  return value;
}
