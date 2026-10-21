CREATE TYPE "SocialTicketKind" AS ENUM ('PRODUCT', 'QUOTE', 'ORDER', 'DELIVERY', 'COMPLAINT', 'OTHER');
CREATE TYPE "SocialTicketPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SocialTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');

CREATE TABLE "social_tickets" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "comment_id" TEXT,
  "request_key" TEXT NOT NULL,
  "kind" "SocialTicketKind" NOT NULL,
  "priority" "SocialTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "SocialTicketStatus" NOT NULL DEFAULT 'OPEN',
  "summary" TEXT NOT NULL,
  "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source_url" TEXT,
  "assigned_staff_id" TEXT,
  "created_by_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "social_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_tickets_exactly_one_source" CHECK (
    ("conversation_id" IS NOT NULL AND "comment_id" IS NULL) OR
    ("conversation_id" IS NULL AND "comment_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "social_tickets_business_id_request_key_key" ON "social_tickets"("business_id", "request_key");
CREATE INDEX "social_tickets_business_id_status_updated_at_idx" ON "social_tickets"("business_id", "status", "updated_at");
CREATE INDEX "social_tickets_business_id_assigned_staff_id_status_idx" ON "social_tickets"("business_id", "assigned_staff_id", "status");
CREATE INDEX "social_tickets_conversation_id_idx" ON "social_tickets"("conversation_id");
CREATE INDEX "social_tickets_comment_id_idx" ON "social_tickets"("comment_id");
ALTER TABLE "social_tickets" ADD CONSTRAINT "social_tickets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_tickets" ADD CONSTRAINT "social_tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_tickets" ADD CONSTRAINT "social_tickets_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "social_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_tickets" ADD CONSTRAINT "social_tickets_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_tickets" ADD CONSTRAINT "social_tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "social_ticket_events" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_ticket_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "social_ticket_events_ticket_id_created_at_idx" ON "social_ticket_events"("ticket_id", "created_at");
ALTER TABLE "social_ticket_events" ADD CONSTRAINT "social_ticket_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_ticket_events" ADD CONSTRAINT "social_ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "social_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_ticket_events" ADD CONSTRAINT "social_ticket_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
