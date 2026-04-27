-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "handle" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "settings_json" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_providers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "plan_type" VARCHAR(50),
    "policy_number" VARCHAR(100),
    "group_number" VARCHAR(100),
    "claims_address" TEXT,
    "claims_phone" VARCHAR(20),
    "portal_url" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "insurance_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_organizations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "phone" VARCHAR(20),
    "ein" VARCHAR(20),
    "npi" VARCHAR(10),
    "superbill_format" VARCHAR(50),
    "billing_contact" VARCHAR(255),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "clinic_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinicians" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "credential" VARCHAR(50),
    "license_number" VARCHAR(50),
    "npi" VARCHAR(10),
    "specialty" VARCHAR(100),
    "typical_cpt_codes" VARCHAR(50)[],
    "rate_per_session" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "clinicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "relationship" VARCHAR(50) NOT NULL,
    "member_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "dependents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "insurance_provider_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "clinician_id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "claim_number" VARCHAR(100),
    "claim_part" VARCHAR(20),
    "date_of_service" DATE NOT NULL,
    "date_of_service_end" DATE,
    "date_submitted" DATE,
    "cpt_code" VARCHAR(10) NOT NULL,
    "cpt_modifier" VARCHAR(10),
    "place_of_service" VARCHAR(5),
    "diagnosis_codes" VARCHAR(100)[],
    "billed_amount" DECIMAL(10,2) NOT NULL,
    "allowed_amount" DECIMAL(10,2),
    "amount_saved" DECIMAL(10,2),
    "insurance_paid" DECIMAL(10,2),
    "patient_responsibility" DECIMAL(10,2),
    "deductible_applied" DECIMAL(10,2),
    "copay" DECIMAL(10,2),
    "coinsurance" DECIMAL(10,2),
    "plan_does_not_cover" DECIMAL(10,2),
    "claim_processing_codes" VARCHAR(20)[],
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "status_detail" TEXT,
    "submission_method" VARCHAR(20),
    "superbill_id" UUID,
    "advocate_action" TEXT,
    "advocate_comments" TEXT,
    "notes" TEXT,
    "service_description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_events" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "event_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_status" VARCHAR(30),
    "new_status" VARCHAR(30),
    "description" TEXT,
    "metadata_json" JSONB,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_method" VARCHAR(20) NOT NULL,
    "check_number" VARCHAR(50),
    "total_amount" DECIMAL(10,2) NOT NULL,
    "payer" VARCHAR(255),
    "received" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "allocated_amount" DECIMAL(10,2) NOT NULL,
    "is_overpayment" BOOLEAN NOT NULL DEFAULT false,
    "adjustment_reason" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eob_documents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "insurance_provider_id" UUID NOT NULL,
    "claim_id" UUID,
    "received_date" DATE,
    "eob_date" DATE,
    "file_path" VARCHAR(500),
    "claim_number" VARCHAR(100),
    "provider_name" VARCHAR(255),
    "service_date_start" DATE,
    "service_date_end" DATE,
    "provider_billed" DECIMAL(10,2),
    "amount_saved" DECIMAL(10,2),
    "plan_allowed_amount" DECIMAL(10,2),
    "plan_paid" DECIMAL(10,2),
    "applied_to_deductible" DECIMAL(10,2),
    "copay" DECIMAL(10,2),
    "coinsurance" DECIMAL(10,2),
    "plan_does_not_cover" DECIMAL(10,2),
    "total_you_owe" DECIMAL(10,2),
    "claim_processing_codes" VARCHAR(20)[],
    "adjustments" DECIMAL(10,2),
    "is_reprocessed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "eob_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reprocessing_requests" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "request_date" DATE NOT NULL,
    "reason" TEXT,
    "reason_code" VARCHAR(50),
    "submission_method" VARCHAR(20),
    "reference_number" VARCHAR(100),
    "status" VARCHAR(30) NOT NULL DEFAULT 'submitted',
    "outcome" TEXT,
    "resolution_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reprocessing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "claim_id" UUID,
    "title" VARCHAR(255),
    "messages_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_balance_snapshots" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "dependent_id" UUID NOT NULL,
    "eob_id" UUID,
    "as_of_date" DATE NOT NULL,
    "plan_year" VARCHAR(4) NOT NULL,
    "network_type" VARCHAR(20) NOT NULL,
    "scope" VARCHAR(20) NOT NULL,
    "deductible_max" DECIMAL(10,2) NOT NULL,
    "deductible_applied" DECIMAL(10,2) NOT NULL,
    "oop_max" DECIMAL(10,2) NOT NULL,
    "oop_applied" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_balance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "superbills" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "file_path" VARCHAR(500),
    "billing_period_start" DATE NOT NULL,
    "billing_period_end" DATE NOT NULL,
    "total_amount" DECIMAL(10,2),
    "received_date" DATE,
    "parsed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "superbills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_line_items" (
    "id" UUID NOT NULL,
    "superbill_id" UUID NOT NULL,
    "claim_id" UUID,
    "clinician_id" UUID NOT NULL,
    "date_of_service" DATE NOT NULL,
    "cpt_code" VARCHAR(10) NOT NULL,
    "cpt_modifier" VARCHAR(10),
    "units" INTEGER NOT NULL DEFAULT 1,
    "place_of_service" VARCHAR(5),
    "diagnosis_codes" VARCHAR(100)[],
    "description" TEXT,
    "fee" DECIMAL(10,2) NOT NULL,
    "amount_paid" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_claimable_charges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "charge_type" VARCHAR(50) NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "clinician_id" UUID,
    "description" TEXT,
    "billing_period" VARCHAR(20),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "non_claimable_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "insurance_providers" ADD CONSTRAINT "insurance_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_organizations" ADD CONSTRAINT "clinic_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinicians" ADD CONSTRAINT "clinicians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinicians" ADD CONSTRAINT "clinicians_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_insurance_provider_id_fkey" FOREIGN KEY ("insurance_provider_id") REFERENCES "insurance_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_clinician_id_fkey" FOREIGN KEY ("clinician_id") REFERENCES "clinicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_superbill_id_fkey" FOREIGN KEY ("superbill_id") REFERENCES "superbills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eob_documents" ADD CONSTRAINT "eob_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eob_documents" ADD CONSTRAINT "eob_documents_insurance_provider_id_fkey" FOREIGN KEY ("insurance_provider_id") REFERENCES "insurance_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eob_documents" ADD CONSTRAINT "eob_documents_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reprocessing_requests" ADD CONSTRAINT "reprocessing_requests_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_balance_snapshots" ADD CONSTRAINT "plan_balance_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_balance_snapshots" ADD CONSTRAINT "plan_balance_snapshots_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "dependents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_balance_snapshots" ADD CONSTRAINT "plan_balance_snapshots_eob_id_fkey" FOREIGN KEY ("eob_id") REFERENCES "eob_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "superbills" ADD CONSTRAINT "superbills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "superbills" ADD CONSTRAINT "superbills_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_superbill_id_fkey" FOREIGN KEY ("superbill_id") REFERENCES "superbills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_clinician_id_fkey" FOREIGN KEY ("clinician_id") REFERENCES "clinicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_claimable_charges" ADD CONSTRAINT "non_claimable_charges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_claimable_charges" ADD CONSTRAINT "non_claimable_charges_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_claimable_charges" ADD CONSTRAINT "non_claimable_charges_clinician_id_fkey" FOREIGN KEY ("clinician_id") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

