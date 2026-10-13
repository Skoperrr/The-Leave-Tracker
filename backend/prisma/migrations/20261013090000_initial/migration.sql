BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "managerMembershipId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balanceLimited" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "allocatedDays" DECIMAL(8,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveGroup" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "groupId" UUID,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approverMembershipId" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "visibility" TEXT NOT NULL DEFAULT 'ORGANISATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE INDEX "Membership_organisationId_active_role_idx" ON "Membership"("organisationId", "active", "role");

-- CreateIndex
CREATE INDEX "Membership_managerMembershipId_idx" ON "Membership"("managerMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organisationId_key" ON "Membership"("userId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_organisationId_key" ON "Membership"("id", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_organisationId_userId_key" ON "Membership"("id", "organisationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_organisationId_code_key" ON "LeaveType"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_id_organisationId_key" ON "LeaveType"("id", "organisationId");

-- CreateIndex
CREATE INDEX "LeaveBalance_organisationId_year_idx" ON "LeaveBalance"("organisationId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_membershipId_leaveTypeId_year_key" ON "LeaveBalance"("membershipId", "leaveTypeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveGroup_id_userId_key" ON "LeaveGroup"("id", "userId");

-- CreateIndex
CREATE INDEX "LeaveRequest_membershipId_status_startDate_endDate_idx" ON "LeaveRequest"("membershipId", "status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_organisationId_status_submittedAt_idx" ON "LeaveRequest"("organisationId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "LeaveRequest_approverMembershipId_idx" ON "LeaveRequest"("approverMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_id_organisationId_key" ON "LeaveRequest"("id", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_groupId_organisationId_key" ON "LeaveRequest"("groupId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_requestId_key" ON "CalendarEvent"("requestId");

-- CreateIndex
CREATE INDEX "CalendarEvent_organisationId_startDate_endDate_idx" ON "CalendarEvent"("organisationId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_requestId_organisationId_key" ON "CalendarEvent"("requestId", "organisationId");

-- CreateIndex
CREATE INDEX "AuditLog_organisationId_createdAt_idx" ON "AuditLog"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_managerMembershipId_organisationId_fkey" FOREIGN KEY ("managerMembershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_membershipId_organisationId_fkey" FOREIGN KEY ("membershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_organisationId_fkey" FOREIGN KEY ("leaveTypeId", "organisationId") REFERENCES "LeaveType"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveGroup" ADD CONSTRAINT "LeaveGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_membershipId_organisationId_userId_fkey" FOREIGN KEY ("membershipId", "organisationId", "userId") REFERENCES "Membership"("id", "organisationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_organisationId_fkey" FOREIGN KEY ("leaveTypeId", "organisationId") REFERENCES "LeaveType"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_groupId_userId_fkey" FOREIGN KEY ("groupId", "userId") REFERENCES "LeaveGroup"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approverMembershipId_organisationId_fkey" FOREIGN KEY ("approverMembershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_requestId_organisationId_fkey" FOREIGN KEY ("requestId", "organisationId") REFERENCES "LeaveRequest"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additional invariants not expressed in the Prisma schema.
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_not_own_manager" CHECK ("managerMembershipId" IS NULL OR "managerMembershipId" <> "id");
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_nonnegative" CHECK ("allocatedDays" >= 0);
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_valid_year" CHECK ("year" BETWEEN 2000 AND 9999);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_valid_dates" CHECK ("endDate" >= "startDate" AND EXTRACT(YEAR FROM "startDate") = EXTRACT(YEAR FROM "endDate"));
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_positive_days" CHECK ("workingDays" > 0);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_not_self_decision" CHECK ("approverMembershipId" IS NULL OR "approverMembershipId" <> "membershipId");
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decision_metadata" CHECK (
  ("status" IN ('PENDING', 'CANCELLED') AND "approverMembershipId" IS NULL AND "decidedAt" IS NULL)
  OR ("status" IN ('APPROVED', 'DECLINED') AND "approverMembershipId" IS NOT NULL AND "decidedAt" IS NOT NULL)
);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decline_comment" CHECK ("status" <> 'DECLINED' OR ("decisionComment" IS NOT NULL AND LENGTH(TRIM("decisionComment")) > 0));
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_valid_dates" CHECK ("endDate" >= "startDate");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_org_visibility" CHECK ("visibility" = 'ORGANISATION');

-- Browser clients must use the backend, not Supabase's business-table API.
-- No client-access policies: the server's privileged DB role accesses these tables.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

COMMIT;
