CREATE TYPE "IntegrationAuthAttemptStatus" AS ENUM ('PENDING', 'CLAIMED', 'READY', 'FINALIZING', 'COMPLETED', 'DENIED', 'FAILED');

CREATE TABLE "integration_auth_attempts" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "state_hash" TEXT NOT NULL,
  "redirect_uri" TEXT NOT NULL,
  "reconnect_connection_id" TEXT,
  "status" "IntegrationAuthAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "claimed_at" TIMESTAMP(3),
  "credential_ciphertext" TEXT,
  "available_accounts" JSONB,
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_auth_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integration_auth_attempts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "integration_auth_attempts_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "integration_auth_attempts_state_hash_key" ON "integration_auth_attempts"("state_hash");
CREATE INDEX "integration_auth_attempts_business_id_actor_id_status_expires_at_idx" ON "integration_auth_attempts"("business_id", "actor_id", "status", "expires_at");
