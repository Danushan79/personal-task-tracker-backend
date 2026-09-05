import { describe, expect, it, vi } from 'vitest';

import { sanitizeKeys } from '@/middleware/sanitize-keys';

describe('sanitizeKeys', () => {
  it('strips top-level and nested keys starting with $ or containing a dot', () => {
    const req = {
      body: {
        name: 'Work',
        $where: 'this.a === this.b',
        'a.b': 'dotted',
        nested: { $gt: '', safe: 1 },
        list: [{ $ne: null }, { ok: true }],
      },
    } as unknown as Parameters<typeof sanitizeKeys>[0];
    const next = vi.fn();

    sanitizeKeys(req, {} as never, next);

    expect(req.body).toEqual({
      name: 'Work',
      nested: { safe: 1 },
      list: [{}, { ok: true }],
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it('leaves a non-object body untouched', () => {
    const req = { body: 'raw-string' } as unknown as Parameters<typeof sanitizeKeys>[0];
    const next = vi.fn();

    sanitizeKeys(req, {} as never, next);

    expect(req.body).toBe('raw-string');
    expect(next).toHaveBeenCalledOnce();
  });
});
