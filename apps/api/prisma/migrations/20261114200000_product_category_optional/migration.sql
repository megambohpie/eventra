-- Kategori produk menjadi opsional (produk boleh tanpa kategori). Aditif.
ALTER TABLE "products" ALTER COLUMN "category_id" DROP NOT NULL;

-- Rollback: isi category_id produk yang NULL dengan kategori yang ada, lalu ALTER TABLE products ALTER COLUMN category_id SET NOT NULL;
