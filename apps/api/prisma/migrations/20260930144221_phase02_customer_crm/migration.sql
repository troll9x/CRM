-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "AddressStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('NEW', 'QUALIFIED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "OpportunityKind" AS ENUM ('FIRST_PURCHASE', 'REPEAT_PURCHASE');

-- CreateTable
CREATE TABLE "customer_groups" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "source" TEXT,
    "legal_name" TEXT,
    "tax_code" TEXT,
    "notes" TEXT,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "assigned_staff_id" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_points" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "label" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT,
    "recipient_name" TEXT,
    "phone" TEXT,
    "line1" TEXT NOT NULL,
    "ward" TEXT,
    "district" TEXT,
    "province" TEXT NOT NULL,
    "country_code" TEXT NOT NULL DEFAULT 'VN',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "AddressStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_tasks" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "assigned_staff_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_opportunities" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "assigned_staff_id" TEXT,
    "title" TEXT NOT NULL,
    "kind" "OpportunityKind" NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_groups_business_id_code_key" ON "customer_groups"("business_id", "code");

-- CreateIndex
CREATE INDEX "customers_business_id_status_updated_at_idx" ON "customers"("business_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "customers_business_id_name_normalized_idx" ON "customers"("business_id", "name_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "customers_business_id_customer_code_key" ON "customers"("business_id", "customer_code");

-- CreateIndex
CREATE INDEX "contact_points_business_id_type_normalized_value_idx" ON "contact_points"("business_id", "type", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "contact_points_customer_id_type_normalized_value_key" ON "contact_points"("customer_id", "type", "normalized_value");

-- CreateIndex
CREATE INDEX "addresses_customer_id_status_idx" ON "addresses"("customer_id", "status");

-- CreateIndex
CREATE INDEX "customer_tasks_business_id_status_due_at_idx" ON "customer_tasks"("business_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "customer_tasks_customer_id_created_at_idx" ON "customer_tasks"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_opportunities_business_id_stage_updated_at_idx" ON "sales_opportunities"("business_id", "stage", "updated_at");

-- CreateIndex
CREATE INDEX "sales_opportunities_customer_id_created_at_idx" ON "sales_opportunities"("customer_id", "created_at");

-- AddForeignKey
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "customer_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tasks" ADD CONSTRAINT "customer_tasks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tasks" ADD CONSTRAINT "customer_tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tasks" ADD CONSTRAINT "customer_tasks_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
