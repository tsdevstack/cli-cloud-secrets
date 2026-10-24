import { describe, it, expect, rs, beforeEach } from '@rstest/core';

rs.mock('inquirer', { mock: true });

import inquirer from 'inquirer';
import { promptSecretValue } from './prompt-secret-value';

describe('promptSecretValue', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(inquirer.prompt).mockResolvedValue({ value: 'typed' } as never);
  });

  it('should mask a credential', async () => {
    await expect(
      promptSecretValue('RESEND_API_KEY', 'Enter value:'),
    ).resolves.toBe('typed');

    expect(inquirer.prompt).toHaveBeenCalledWith([
      { type: 'password', name: 'value', message: 'Enter value:', mask: '*' },
    ]);
  });

  it('should mask custom secrets', async () => {
    await promptSecretValue('STRIPE_SECRET_KEY', 'Enter value:');

    expect(inquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'password' }),
    ]);
  });

  it.each(['DOMAIN', 'EMAIL_FROM', 'ADMIN_EMAILS'])(
    'should show %s as typed',
    async (key) => {
      await promptSecretValue(key, 'Enter value:');

      expect(inquirer.prompt).toHaveBeenCalledWith([
        { type: 'input', name: 'value', message: 'Enter value:' },
      ]);
    },
  );
});
