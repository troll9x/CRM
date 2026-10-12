ALTER TYPE "CustomerStatus" ADD VALUE 'MERGED';

CREATE TYPE "CustomerDuplicateStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'STALE');

ALTER TABLE "customers" ADD COLUMN "merged_into_id" TEXT;
ALTER TABLE "customers" ADD CONSTRAINT "customers_merged_into_id_fkey"
  FOREIGN KEY ("merged_into_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "customers_merged_into_id_idx" ON "customers"("merged_into_id");

ALTER TABLE "external_customer_identities"
  ADD COLUMN "linked_by_id" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "external_customer_identities" ADD CONSTRAINT "external_customer_identities_linked_by_id_fkey"
  FOREIGN KEY ("linked_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "customer_duplicate_suggestions" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "suggestion_key" TEXT NOT NULL,
  "customer_a_id" TEXT NOT NULL,
  "customer_b_id" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "evidence_fingerprint" TEXT NOT NULL,
  "status" "CustomerDuplicateStatus" NOT NULL DEFAULT 'PENDING',
  "decision_reason" TEXT,
  "decided_by_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_duplicate_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_duplicate_suggestions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_duplicate_suggestions_customer_a_id_fkey" FOREIGN KEY ("customer_a_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_duplicate_suggestions_customer_b_id_fkey" FOREIGN KEY ("customer_b_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_duplicate_suggestions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_duplicate_suggestions_business_id_suggestion_key_key"
  ON "customer_duplicate_suggestions"("business_id", "suggestion_key");
CREATE INDEX "customer_duplicate_suggestions_business_id_status_created_at_idx"
  ON "customer_duplicate_suggestions"("business_id", "status", "created_at");
CREATE INDEX "customer_duplicate_suggestions_business_id_customer_a_id_customer_b_id_idx"
  ON "customer_duplicate_suggestions"("business_id", "customer_a_id", "customer_b_id");

CREATE TABLE "customer_merge_commands" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_merge_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_merge_commands_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_merge_commands_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_merge_commands_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_merge_commands_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_merge_commands_business_id_idempotency_key_key"
  ON "customer_merge_commands"("business_id", "idempotency_key");
CREATE INDEX "customer_merge_commands_business_id_source_id_created_at_idx"
  ON "customer_merge_commands"("business_id", "source_id", "created_at");
