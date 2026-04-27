-- CreateTable
CREATE TABLE "reconciliation_reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "clinic" TEXT,
    "patient" TEXT,
    "billing_period_start" DATE NOT NULL,
    "billing_period_end" DATE NOT NULL,
    "file_name" VARCHAR(500),
    "summary_json" JSONB NOT NULL,
    "items_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_reports_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "reconciliation_reports" ADD CONSTRAINT "reconciliation_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
