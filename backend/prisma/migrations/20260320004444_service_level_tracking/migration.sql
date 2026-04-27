/*
  Warnings:

  - You are about to drop the column `billed_amount` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `clinician_id` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `cpt_code` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `cpt_modifier` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `date_of_service` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `date_of_service_end` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `diagnosis_codes` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `place_of_service` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `service_description` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `fee` on the `service_line_items` table. All the data in the column will be lost.
  - Added the required column `billed_amount` to the `service_line_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clinic_id` to the `service_line_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dependent_id` to the `service_line_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `service_line_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `service_line_items` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "claims" DROP CONSTRAINT "claims_clinician_id_fkey";

-- DropForeignKey
ALTER TABLE "service_line_items" DROP CONSTRAINT "service_line_items_superbill_id_fkey";

-- AlterTable
ALTER TABLE "claims" DROP COLUMN "billed_amount",
DROP COLUMN "clinician_id",
DROP COLUMN "cpt_code",
DROP COLUMN "cpt_modifier",
DROP COLUMN "date_of_service",
DROP COLUMN "date_of_service_end",
DROP COLUMN "diagnosis_codes",
DROP COLUMN "place_of_service",
DROP COLUMN "service_description",
ADD COLUMN     "service_period_end" DATE,
ADD COLUMN     "service_period_start" DATE,
ADD COLUMN     "total_billed" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "service_line_items" DROP COLUMN "fee",
ADD COLUMN     "billed_amount" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "clinic_id" UUID NOT NULL,
ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "dependent_id" UUID NOT NULL,
ADD COLUMN     "insurance_provider_id" UUID,
ADD COLUMN     "status" VARCHAR(30) NOT NULL DEFAULT 'unsubmitted',
ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "superbill_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_insurance_provider_id_fkey" FOREIGN KEY ("insurance_provider_id") REFERENCES "insurance_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_superbill_id_fkey" FOREIGN KEY ("superbill_id") REFERENCES "superbills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
