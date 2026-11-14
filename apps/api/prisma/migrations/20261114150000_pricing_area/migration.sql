-- Dasar harga baru "per m²": harga produk = tarif per m² × luas satu unit (lebar × tinggi). Aditif.
ALTER TYPE "PricingUnit" ADD VALUE 'AREA';

-- Rollback: nilai enum PricingUnit tidak dapat dihapus; ubah produk AREA ke PCS/PACKAGE dan biarkan nilainya tidak terpakai.
