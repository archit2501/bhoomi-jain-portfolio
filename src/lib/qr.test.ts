import { describe, expect, it } from 'vitest';
import { qrPath } from './qr';

describe('qrPath', () => {
  it('one rectangle per run of dark modules, row by row', () => {
    expect(
      qrPath([
        [true, true, false, true],
        [false, false, false, false],
        [true, false, true, true],
      ]),
    ).toBe('M0 0h2v1h-2zM3 0h1v1h-1zM0 2h1v1h-1zM2 2h2v1h-2z');
  });

  it('nothing for an empty code', () => {
    expect(qrPath([])).toBe('');
    expect(qrPath([[false, false]])).toBe('');
  });
});
