CREATE TYPE "SocialOutboundKind" AS ENUM ('MESSENGER', 'COMMENT_REPLY');
CREATE TYPE "SocialOutboundStatus" AS ENUM ('PENDING', 'SENDING', 'SENT_TO_PROVIDER', 'FAILED', 'UNKNOWN');

CREATE TABLE "social_outbounds" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "comment_id" TEXT,
  "actor_id" TEXT NOT NULL,
  "request_key" TEXT NOT NULL,
  "kind" "SocialOutboundKind" NOT NULL,
  "status" "SocialOutboundStatus" NOT NULL DEFAULT 'PENDING',
  "body" TEXT NOT NULL,
  "provider_object_id" TEXT,
  "error_code" TEXT,
  "attempted_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "social_outbounds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_outbounds_source_check" CHECK (
    ("kind" = 'MESSENGER' AND "conversation_id" IS NOT NULL AND "comment_id" IS NULL) OR
    ("kind" = 'COMMENT_REPLY' AND "conversation_id" IS NULL AND "comment_id" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "social_outbounds_business_id_request_key_key" ON "social_outbounds"("business_id", "request_key");
CREATE UNIQUE INDEX "social_outbounds_connection_id_provider_object_id_key" ON "social_outbounds"("connection_id", "provider_object_id");
CREATE INDEX "social_outbounds_conversation_id_created_at_idx" ON "social_outbounds"("conversation_id", "created_at");
CREATE INDEX "social_outbounds_comment_id_created_at_idx" ON "social_outbounds"("comment_id", "created_at");
ALTER TABLE "social_outbounds" ADD CONSTRAINT "social_outbounds_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_outbounds" ADD CONSTRAINT "social_outbounds_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_outbounds" ADD CONSTRAINT "social_outbounds_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_outbounds" ADD CONSTRAINT "social_outbounds_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "social_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_outbounds" ADD CONSTRAINT "social_outbounds_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
