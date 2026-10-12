ALTER TYPE "CustomerCreditEventType" ADD VALUE 'APPLICATION';
ALTER TYPE "CustomerCreditEventType" ADD VALUE 'REVERSAL';
CREATE TYPE "CustomerCreditApplicationStatus" AS ENUM ('ACTIVE', 'REVERSED');
