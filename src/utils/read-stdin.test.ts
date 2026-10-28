import { describe, it, expect, rs, beforeEach } from '@rstest/core';

rs.mock('node:fs', () => ({ readFileSync: rs.fn() }));

import { readFileSync } from 'node:fs';
import { readStdin } from './read-stdin';

describe('readStdin', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('Standard use cases', () => {
    it('should read file descriptor 0 as UTF-8', () => {
      rs.mocked(readFileSync).mockReturnValue('s3cret');

      expect(readStdin()).toBe('s3cret');
      expect(readFileSync).toHaveBeenCalledWith(0, 'utf-8');
    });
  });

  describe('Edge cases', () => {
    it('should keep a trailing newline', () => {
      rs.mocked(readFileSync).mockReturnValue('-----END KEY-----\n');

      expect(readStdin()).toBe('-----END KEY-----\n');
    });
  });
});
