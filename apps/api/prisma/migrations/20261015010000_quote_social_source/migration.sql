ALTER TABLE "quotes"
  ADD COLUMN "source_conversation_id" TEXT,
  ADD COLUMN "source_message_id" TEXT,
  ADD COLUMN "source_ticket_id" TEXT;

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_source_conversation_id_fkey"
  FOREIGN KEY ("source_conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_source_message_id_fkey"
  FOREIGN KEY ("source_message_id") REFERENCES "conversation_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_source_ticket_id_fkey"
  FOREIGN KEY ("source_ticket_id") REFERENCES "social_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "quotes_source_conversation_id_idx" ON "quotes"("source_conversation_id");
CREATE INDEX "quotes_source_message_id_idx" ON "quotes"("source_message_id");
CREATE INDEX "quotes_source_ticket_id_idx" ON "quotes"("source_ticket_id");

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_source_message_requires_conversation"
  CHECK ("source_message_id" IS NULL OR "source_conversation_id" IS NOT NULL);
