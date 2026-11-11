import { describe, expect, it } from 'vitest';
import { en } from './en';
import { id } from './id';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('locales', () => {
  it('kunci en dan id identik', () => {
    expect(keys(id).sort()).toEqual(keys(en).sort());
  });
  it('tidak ada terjemahan kosong', () => {
    for (const lang of [en, id]) {
      const flat = JSON.stringify(lang);
      expect(flat).not.toContain('""');
    }
  });
});
