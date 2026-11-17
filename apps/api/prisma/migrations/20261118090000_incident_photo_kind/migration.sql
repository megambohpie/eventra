-- Foto laporan kerusakan dikelompokkan: barang, kerusakan, dan barang dengan stiker aset terlihat.
-- Aditif; foto lama dianggap ITEM (data historis tidak diubah).
CREATE TYPE "IncidentPhotoKind" AS ENUM ('ITEM', 'DAMAGE', 'STICKER');
ALTER TABLE "incident_photos" ADD COLUMN "kind" "IncidentPhotoKind" NOT NULL DEFAULT 'ITEM';

-- Rollback: ALTER TABLE "incident_photos" DROP COLUMN "kind"; DROP TYPE "IncidentPhotoKind";
