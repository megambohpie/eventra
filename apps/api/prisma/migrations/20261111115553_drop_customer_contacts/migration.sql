/*
  Warnings:

  - You are about to drop the `customer_contacts` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "customer_contacts" DROP CONSTRAINT "customer_contacts_customer_id_fkey";

-- DropTable
DROP TABLE "customer_contacts";
