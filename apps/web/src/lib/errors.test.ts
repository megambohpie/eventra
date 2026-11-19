import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { scanReasonText } from './errors';

const i18n = createInstance();
await i18n.init({
  lng: 'id',
  resources: {
    id: {
      translation: {
        errors: {
          SCAN_ASSET_UNAVAILABLE: 'Aset tidak tersedia',
          SCAN_ASSET_IN_USE:
            'Aset masih dipakai di pesanan {{order}} ({{customer}}), pick list {{pickList}}',
        },
      },
    },
  },
});

describe('teks alasan scan', () => {
  it('mengisi pesanan pemakai dari rincian yang disimpan', () => {
    const note = JSON.stringify({ order: ['ORD-1'], customer: ['Hartono'], pickList: ['PKL-1'] });
    expect(scanReasonText(i18n.t, 'SCAN_ASSET_IN_USE', note)).toBe(
      'Aset masih dipakai di pesanan ORD-1 (Hartono), pick list PKL-1',
    );
  });

  it('event lama tanpa rincian tidak menampilkan placeholder kosong', () => {
    const text = scanReasonText(i18n.t, 'SCAN_ASSET_IN_USE', null);
    expect(text).toBe('Aset tidak tersedia');
    expect(text).not.toContain('{{');
  });
});
