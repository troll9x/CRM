ALTER TABLE "conversation_messages" ADD COLUMN "import_job_id" TEXT;
ALTER TABLE "social_comments" ADD COLUMN "import_job_id" TEXT;

CREATE INDEX "conversation_messages_import_job_id_idx" ON "conversation_messages"("import_job_id");
CREATE INDEX "social_comments_import_job_id_idx" ON "social_comments"("import_job_id");
