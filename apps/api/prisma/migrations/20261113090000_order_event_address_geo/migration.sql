-- Aditif: alamat lengkap + titik koordinat (Google Maps) lokasi acara.
ALTER TABLE "orders" ADD COLUMN "event_address" TEXT;
ALTER TABLE "orders" ADD COLUMN "event_lat" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "event_lng" DOUBLE PRECISION;
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_geo_check" CHECK (
  (event_lat IS NULL AND event_lng IS NULL)
  OR (event_lat BETWEEN -90 AND 90 AND event_lng BETWEEN -180 AND 180)
);
-- Rollback: ALTER TABLE "orders" DROP CONSTRAINT "orders_event_geo_check", DROP COLUMN "event_address", DROP COLUMN "event_lat", DROP COLUMN "event_lng";
