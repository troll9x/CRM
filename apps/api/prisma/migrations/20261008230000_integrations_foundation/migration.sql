CREATE TYPE "IntegrationProvider" AS ENUM ('FACEBOOK', 'ZALO', 'SHOPEE', 'TIKTOK_SHOP');
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('NEEDS_SETUP', 'CONFIGURED_UNVERIFIED', 'CONNECTED', 'REAUTH_REQUIRED', 'PAUSED', 'ERROR');
CREATE TYPE "IntegrationJobKind" AS ENUM ('MESSAGE', 'COMMENT', 'ORDER', 'ORDER_SYNC', 'BACKFILL');
CREATE TYPE "IntegrationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'SUCCEEDED', 'DEAD', 'BLOCKED');
CREATE TYPE "IntegrationResourceDirection" AS ENUM ('INBOUND', 'OUTBOUND_ECHO', 'SYSTEM');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
ALTER TYPE "AdminAlertType" ADD VALUE 'EXTERNAL_ORDER_IMPORTED';

CREATE TABLE "integration_connections" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "external_account_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'NEEDS_SETUP',
  "capabilities" JSONB,
  "credential_ciphertext" TEXT,
  "credential_key_version" INTEGER,
  "token_expires_at" TIMESTAMP(3),
  "last_sync_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "last_error_at" TIMESTAMP(3),
  "connected_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integration_connections_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "integration_connections_business_id_provider_external_accou_key" ON "integration_connections"("business_id", "provider", "external_account_id");
CREATE INDEX "integration_connections_business_id_provider_status_idx" ON "integration_connections"("business_id", "provider", "status");

CREATE TABLE "integration_jobs" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "kind" "IntegrationJobKind" NOT NULL,
  "status" "IntegrationJobStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" TEXT NOT NULL,
  "external_event_id" TEXT,
  "provider_object_id" TEXT,
  "payload" JSONB NOT NULL,
  "provider_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 12,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_owner" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integration_jobs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "integration_jobs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "integration_jobs_connection_id_idempotency_key_key" ON "integration_jobs"("connection_id", "idempotency_key");
CREATE UNIQUE INDEX "integration_jobs_connection_id_external_event_id_key" ON "integration_jobs"("connection_id", "external_event_id");
CREATE INDEX "integration_jobs_status_available_at_lease_expires_at_idx" ON "integration_jobs"("status", "available_at", "lease_expires_at");
CREATE INDEX "integration_jobs_business_id_connection_id_received_at_idx" ON "integration_jobs"("business_id", "connection_id", "received_at");

CREATE TABLE "external_customer_identities" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "external_user_id" TEXT NOT NULL,
  "display_name" TEXT,
  "customer_id" TEXT,
  "linked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_customer_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_customer_identities_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "external_customer_identities_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "external_customer_identities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "external_customer_identities_connection_id_external_user_id_key" ON "external_customer_identities"("connection_id", "external_user_id");
CREATE INDEX "external_customer_identities_business_id_customer_id_idx" ON "external_customer_identities"("business_id", "customer_id");

CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "identity_id" TEXT,
  "external_id" TEXT NOT NULL,
  "subject" TEXT,
  "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "assigned_staff_id" TEXT,
  "unread_at" TIMESTAMP(3),
  "last_message_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "conversations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "conversations_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "external_customer_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "conversations_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "conversations_connection_id_external_id_key" ON "conversations"("connection_id", "external_id");
CREATE INDEX "conversations_business_id_status_last_message_at_idx" ON "conversations"("business_id", "status", "last_message_at");
CREATE INDEX "conversations_business_id_assigned_staff_id_status_idx" ON "conversations"("business_id", "assigned_staff_id", "status");

CREATE TABLE "conversation_messages" (
  "id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "external_message_id" TEXT NOT NULL,
  "direction" "IntegrationResourceDirection" NOT NULL DEFAULT 'INBOUND',
  "content_type" TEXT NOT NULL DEFAULT 'text',
  "body" TEXT,
  "media_metadata" JSONB,
  "provider_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_messages_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "conversation_messages_connection_id_external_message_id_key" ON "conversation_messages"("connection_id", "external_message_id");
CREATE INDEX "conversation_messages_conversation_id_provider_at_idx" ON "conversation_messages"("conversation_id", "provider_at");

CREATE TABLE "internal_conversation_notes" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_conversation_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "internal_conversation_notes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "internal_conversation_notes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "internal_conversation_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "internal_conversation_notes_conversation_id_created_at_idx" ON "internal_conversation_notes"("conversation_id", "created_at");

CREATE TABLE "social_comments" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "external_comment_id" TEXT NOT NULL,
  "external_post_id" TEXT NOT NULL,
  "external_parent_id" TEXT,
  "external_author_id" TEXT,
  "author_display_name" TEXT,
  "body" TEXT,
  "source_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "provider_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "social_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_comments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "social_comments_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "social_comments_connection_id_external_comment_id_key" ON "social_comments"("connection_id", "external_comment_id");
CREATE INDEX "social_comments_business_id_provider_at_idx" ON "social_comments"("business_id", "provider_at");
CREATE INDEX "social_comments_connection_id_external_post_id_provider_at_idx" ON "social_comments"("connection_id", "external_post_id", "provider_at");

CREATE TABLE "external_orders" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "external_order_id" TEXT NOT NULL,
  "source_status" TEXT NOT NULL,
  "normalized_status" TEXT NOT NULL,
  "provider_created_at" TIMESTAMP(3),
  "provider_updated_at" TIMESTAMP(3),
  "currency" TEXT NOT NULL,
  "total_amount" DECIMAL(20,6),
  "recipient_snapshot" JSONB,
  "customer_id" TEXT,
  "sales_order_id" TEXT,
  "alerted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "external_orders_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "external_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "external_orders_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "external_orders_connection_id_external_order_id_key" ON "external_orders"("connection_id", "external_order_id");
CREATE UNIQUE INDEX "external_orders_sales_order_id_key" ON "external_orders"("sales_order_id");
CREATE INDEX "external_orders_business_id_normalized_status_provider_crea_idx" ON "external_orders"("business_id", "normalized_status", "provider_created_at");
CREATE INDEX "external_orders_business_id_provider_updated_at_idx" ON "external_orders"("business_id", "provider_updated_at");

CREATE TABLE "external_order_lines" (
  "id" TEXT NOT NULL,
  "external_order_id" TEXT NOT NULL,
  "external_product_id" TEXT,
  "external_model_id" TEXT,
  "source_sku" TEXT,
  "title_snapshot" TEXT NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "source_unit" TEXT,
  "unit_price" DECIMAL(20,6),
  "line_amount" DECIMAL(20,6),
  "variant_id" TEXT,
  "conversion_factor" DECIMAL(20,6),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_order_lines_external_order_id_fkey" FOREIGN KEY ("external_order_id") REFERENCES "external_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "external_order_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "external_order_lines_external_order_id_idx" ON "external_order_lines"("external_order_id");
CREATE INDEX "external_order_lines_variant_id_idx" ON "external_order_lines"("variant_id");

CREATE TABLE "external_product_mappings" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "external_product_id" TEXT NOT NULL,
  "external_model_id" TEXT NOT NULL DEFAULT '',
  "variant_id" TEXT NOT NULL,
  "conversion_factor" DECIMAL(20,6) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_product_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_product_mappings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "external_product_mappings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "external_product_mappings_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "external_product_mappings_connection_id_external_product_id_key" ON "external_product_mappings"("connection_id", "external_product_id", "external_model_id");
CREATE INDEX "external_product_mappings_business_id_variant_id_idx" ON "external_product_mappings"("business_id", "variant_id");

ALTER TABLE "admin_alerts" ALTER COLUMN "order_id" DROP NOT NULL;
ALTER TABLE "admin_alerts" ADD COLUMN "external_order_id" TEXT;
ALTER TABLE "admin_alerts" ADD COLUMN "dedupe_key" TEXT;
CREATE UNIQUE INDEX "admin_alerts_dedupe_key_key" ON "admin_alerts"("dedupe_key");
ALTER TABLE "admin_alerts" ADD CONSTRAINT "admin_alerts_external_order_id_fkey" FOREIGN KEY ("external_order_id") REFERENCES "external_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
