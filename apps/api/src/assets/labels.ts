import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface LabelData {
  code: string;
  qrToken: string;
  productName: string;
  serial: string | null;
}

/** QR PNG berisi token acak saja. */
export const qrPng = (token: string, width = 512): Promise<Buffer> =>
  QRCode.toBuffer(token, { width, margin: 1, errorCorrectionLevel: 'M', type: 'png' });

const MM = 72 / 25.4;
const COLS = 3;
const ROWS = 8;
const LABEL_W = 63 * MM;
const LABEL_H = 33 * MM;
const MARGIN_X = (210 * MM - COLS * LABEL_W) / 2;
const MARGIN_Y = (297 * MM - ROWS * LABEL_H) / 2;
const QR_SIZE = 26 * MM;

/** PDF label QR (A4, 3×8 label per halaman) dibuat di backend; klien hanya mengunduh/mencetak. */
export async function buildLabelsPdf(labels: LabelData[]): Promise<Buffer> {
  const pngs = await Promise.all(labels.map((l) => qrPng(l.qrToken, 300)));
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Eventra QR labels' } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const perPage = COLS * ROWS;
  labels.forEach((label, i) => {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const slot = i % perPage;
    const x = MARGIN_X + (slot % COLS) * LABEL_W;
    const y = MARGIN_Y + Math.floor(slot / COLS) * LABEL_H;
    const png = pngs[i];
    if (!png) return;

    doc
      .save()
      .lineWidth(0.3)
      .rect(x + 2, y + 2, LABEL_W - 4, LABEL_H - 4)
      .stroke('#bbbbbb')
      .restore();
    doc.image(png, x + 4 * MM, y + (LABEL_H - QR_SIZE) / 2, { width: QR_SIZE, height: QR_SIZE });
    const textX = x + 4 * MM + QR_SIZE + 2 * MM;
    const textW = LABEL_W - (textX - x) - 3 * MM;
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10);
    doc.text(label.code, textX, y + 8 * MM, { width: textW, lineBreak: false });
    doc.font('Helvetica').fontSize(7.5);
    doc.text(label.productName, textX, y + 13 * MM, { width: textW, height: 16, ellipsis: true });
    if (label.serial) {
      doc.fontSize(7).fillColor('#444444');
      doc.text(`SN ${label.serial}`, textX, y + 22 * MM, {
        width: textW,
        lineBreak: false,
        ellipsis: true,
      });
    }
  });

  doc.end();
  return done;
}
