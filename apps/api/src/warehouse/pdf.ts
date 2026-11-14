import PDFDocument from 'pdfkit';
import { docLabel, type HandoverPayload, type HandoverType } from '@eventra/shared';

export interface PdfSignature {
  title: string;
  name: string;
  role: string;
  signedAt: string | null;
  image: Buffer | null;
}

export interface HandoverPdfInput {
  number: string;
  version: number;
  type: HandoverType;
  payload: HandoverPayload;
  createdAt: string;
  revisionReason: string | null;
  signatures: PdfSignature[];
}

const MARGIN = 40;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;

const formatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const fmtTime = (iso: string | null): string =>
  iso ? `${formatter.format(new Date(iso))} WIB` : '-';
const fmtDate = (iso: string): string => dateFormatter.format(new Date(`${iso}T00:00:00.000Z`));

const CONDITION_ID: Record<string, string> = {
  EXCELLENT: 'Sangat baik',
  GOOD: 'Baik',
  FAIR: 'Cukup',
  POOR: 'Kurang',
  DAMAGED: 'Rusak',
};
const STATUS_ID: Record<string, string> = {
  DISPATCHED: 'Keluar',
  RETURNED: 'Kembali',
  MISSING: 'Selisih/hilang',
  VERIFIED: 'Terverifikasi',
  PICKED: 'Dipilih',
};

/** PDF surat jalan / berita acara dibuat dari snapshot dokumen (immutable) dan tanda tangan tersimpan. */
export async function buildHandoverPdf(input: HandoverPdfInput): Promise<Buffer> {
  const { payload } = input;
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: `${input.number} v${input.version}`, Author: 'Eventra' },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const ensure = (height: number) => {
    if (doc.y + height > PAGE_H - MARGIN - 20) doc.addPage();
  };

  // Kepala dokumen
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000').text('EVENTRA', MARGIN, MARGIN);
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(docLabel(input.type), MARGIN, doc.y + 2);
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(`No. ${input.number} · Versi ${input.version}`, MARGIN, doc.y + 2);
  doc.text(`Dibuat: ${fmtTime(input.createdAt)}`, MARGIN, doc.y);
  if (input.version > 1) {
    doc
      .font('Helvetica-Oblique')
      .text(`Revisi${input.revisionReason ? `: ${input.revisionReason}` : ''}`, MARGIN, doc.y);
  }
  doc.moveDown(0.8);

  // Informasi pesanan
  const info: [string, string][] = [
    ['No. pesanan', payload.orderNumber],
    ['Pelanggan', payload.customerName],
    ['Lokasi acara', payload.eventLocation],
    ['Periode sewa', `${fmtDate(payload.startDate)} – ${fmtDate(payload.endDate)}`],
    ['Pick list', payload.pickListNumber],
    ['Pelaksana', payload.performedBy],
    [payload.type === 'OUT' ? 'Waktu keluar' : 'Waktu kembali', fmtTime(payload.performedAt)],
    [
      payload.type === 'OUT' ? 'PIC gudang keluar' : 'PIC gudang kembali',
      payload.warehousePic
        ? `${payload.warehousePic.name}${payload.warehousePic.phone ? ` (${payload.warehousePic.phone})` : ''}`
        : '-',
    ],
  ];
  for (const [label, value] of info) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9.5).fillColor('#555555').text(label, MARGIN, y, { width: 120 });
    doc.fillColor('#000000').text(value, MARGIN + 125, y, { width: CONTENT_W - 125 });
  }
  doc.moveDown(0.8);

  // Ringkasan kebutuhan
  doc.font('Helvetica-Bold').fontSize(10.5).text('Ringkasan barang', MARGIN, doc.y);
  doc.font('Helvetica').fontSize(9.5);
  for (const l of payload.lines) {
    doc.text(`• ${l.quantity} × ${l.productName}`, MARGIN + 6, doc.y);
  }
  // Kelompok "per meter": luas dipesan vs luas kabinet yang benar-benar disiapkan.
  for (const a of payload.areaLines ?? []) {
    doc.text(
      `  Luas ${a.productName}: dipesan ${a.orderedM2} m², disiapkan ${a.packedM2} m²`,
      MARGIN + 6,
      doc.y,
    );
  }
  const s = payload.summary;
  doc.moveDown(0.3);
  doc.text(
    payload.type === 'OUT'
      ? `Total aset keluar: ${s.expected}`
      : `Dikeluarkan: ${s.expected} · Kembali: ${s.returned} · Selisih: ${s.missing}`,
    MARGIN,
    doc.y,
  );
  doc.moveDown(0.8);

  // Tabel aset
  const cols = [
    { title: 'No', w: 24 },
    { title: 'Kode aset', w: 70 },
    { title: 'Produk', w: 150 },
    { title: 'Serial', w: 70 },
    { title: 'Kondisi', w: 55 },
    { title: payload.type === 'OUT' ? 'Waktu keluar' : 'Waktu scan', w: 90 },
    { title: 'Status', w: 56 },
  ];
  const drawHeader = () => {
    let x = MARGIN;
    const y = doc.y;
    doc.rect(MARGIN, y - 2, CONTENT_W, 16).fill('#e5e7eb');
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5);
    for (const c of cols) {
      doc.text(c.title, x + 2, y + 1, { width: c.w - 4, lineBreak: false });
      x += c.w;
    }
    doc.y = y + 18;
  };
  drawHeader();
  payload.items.forEach((item, index) => {
    if (doc.y + 16 > PAGE_H - MARGIN - 20) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    const cells = [
      String(index + 1),
      item.assetCode,
      item.productName,
      item.serial ?? '-',
      item.condition ? (CONDITION_ID[item.condition] ?? item.condition) : '-',
      fmtTime(item.scannedAt).replace(' WIB', ''),
      STATUS_ID[item.status] ?? item.status,
    ];
    let x = MARGIN;
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(item.status === 'MISSING' ? '#b91c1c' : '#000000');
    cells.forEach((cell, i) => {
      const col = cols[i];
      if (!col) return;
      doc.text(cell, x + 2, y, { width: col.w - 4, lineBreak: false, ellipsis: true });
      x += col.w;
    });
    doc
      .moveTo(MARGIN, y + 13)
      .lineTo(MARGIN + CONTENT_W, y + 13)
      .lineWidth(0.3)
      .stroke('#cccccc');
    doc.y = y + 15;
    if (item.note) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#555555');
      doc.text(`   Catatan: ${item.note}`, MARGIN, doc.y);
    }
  });
  doc.fillColor('#000000');

  // Barang stok tidak terbatas (mis. kabel): dibuktikan dengan hitung jumlah, bukan scan QR.
  const counted = payload.countedLines ?? [];
  if (counted.length > 0) {
    const isReturn = payload.type === 'RETURN';
    const widths = isReturn ? [210, 75, 75, 75, 80] : [285, 105, 105];
    const titles = isReturn
      ? ['Barang (hitung jumlah)', 'Dibutuhkan', 'Dikeluarkan', 'Kembali', 'Selisih']
      : ['Barang (hitung jumlah)', 'Dibutuhkan', 'Dikeluarkan'];
    ensure(40 + counted.length * 16);
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000000');
    doc.text('Barang tanpa QR (dihitung)', MARGIN, doc.y);
    doc.moveDown(0.3);
    const headY = doc.y;
    doc.rect(MARGIN, headY - 2, CONTENT_W, 16).fill('#e5e7eb');
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5);
    let hx = MARGIN;
    titles.forEach((title, i) => {
      doc.text(title, hx + 2, headY + 1, { width: (widths[i] ?? 80) - 4, lineBreak: false });
      hx += widths[i] ?? 80;
    });
    doc.y = headY + 18;
    for (const line of counted) {
      const y = doc.y;
      const cells = isReturn
        ? [
            line.productName,
            String(line.required),
            String(line.packed),
            line.returned === null ? '-' : String(line.returned),
            line.lost === null ? '-' : String(line.lost),
          ]
        : [line.productName, String(line.required), String(line.packed)];
      let x = MARGIN;
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(line.lost && line.lost > 0 ? '#b91c1c' : '#000000');
      cells.forEach((cell, i) => {
        doc.text(cell, x + 2, y, {
          width: (widths[i] ?? 80) - 4,
          lineBreak: false,
          ellipsis: true,
        });
        x += widths[i] ?? 80;
      });
      doc
        .moveTo(MARGIN, y + 13)
        .lineTo(MARGIN + CONTENT_W, y + 13)
        .lineWidth(0.3)
        .stroke('#cccccc');
      doc.y = y + 15;
    }
    doc.fillColor('#000000');
  }

  if (payload.note) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(9.5).text('Catatan', MARGIN, doc.y);
    doc.font('Helvetica').text(payload.note, MARGIN, doc.y, { width: CONTENT_W });
  }

  // Tanda tangan
  ensure(130);
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(10.5).text('Tanda tangan', MARGIN, doc.y);
  doc.moveDown(0.4);
  const boxW = (CONTENT_W - 20) / 2;
  const top = doc.y;
  input.signatures.slice(0, 2).forEach((sig, i) => {
    const x = MARGIN + i * (boxW + 20);
    doc.rect(x, top, boxW, 105).lineWidth(0.5).stroke('#888888');
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#000000')
      .text(sig.title, x + 6, top + 5, {
        width: boxW - 12,
      });
    if (sig.image) {
      doc.image(sig.image, x + 6, top + 20, { fit: [boxW - 12, 50], align: 'center' });
    } else {
      doc
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .fillColor('#888888')
        .text('(belum ditandatangani)', x + 6, top + 40, { width: boxW - 12, align: 'center' });
    }
    doc
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(sig.name, x + 6, top + 74, {
        width: boxW - 12,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .font('Helvetica')
      .fontSize(8)
      .text(`${sig.role}${sig.signedAt ? ` · ${fmtTime(sig.signedAt)}` : ''}`, x + 6, top + 88, {
        width: boxW - 12,
        lineBreak: false,
        ellipsis: true,
      });
  });

  // Footer pada setiap halaman
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // cegah pdfkit menambah halaman saat menulis footer
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#777777')
      .text(
        `${input.number} v${input.version} · Halaman ${i - range.start + 1}/${range.count} · Dokumen dibuat oleh sistem Eventra`,
        MARGIN,
        PAGE_H - MARGIN + 6,
        { width: CONTENT_W, align: 'center', lineBreak: false },
      );
  }

  doc.end();
  return done;
}
