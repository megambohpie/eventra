-- Baris aksesori tambahan (include) di luar pesanan berkebutuhan 0; baris pesanan tetap > 0.
ALTER TABLE "pick_list_lines" DROP CONSTRAINT "pick_list_lines_quantity_positive";
ALTER TABLE "pick_list_lines" ADD CONSTRAINT "pick_list_lines_quantity_positive"
  CHECK ("quantity" > 0 OR "extra");

-- Rollback: hapus baris extra, lalu ALTER TABLE pick_list_lines DROP CONSTRAINT pick_list_lines_quantity_positive, ADD CONSTRAINT pick_list_lines_quantity_positive CHECK (quantity > 0);
