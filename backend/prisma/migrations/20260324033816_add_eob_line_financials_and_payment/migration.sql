-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "patient_account_number" VARCHAR(100),
ADD COLUMN     "payment_amount" DECIMAL(10,2),
ADD COLUMN     "payment_check_number" VARCHAR(50),
ADD COLUMN     "payment_date" DATE;

-- AlterTable
ALTER TABLE "service_line_items" ADD COLUMN     "allowed_amount" DECIMAL(10,2),
ADD COLUMN     "amount_owed" DECIMAL(10,2),
ADD COLUMN     "amount_saved" DECIMAL(10,2),
ADD COLUMN     "coinsurance" DECIMAL(10,2),
ADD COLUMN     "copay" DECIMAL(10,2),
ADD COLUMN     "deductible_applied" DECIMAL(10,2),
ADD COLUMN     "plan_does_not_cover" DECIMAL(10,2),
ADD COLUMN     "plan_paid" DECIMAL(10,2),
ADD COLUMN     "processing_codes" VARCHAR(20)[];
