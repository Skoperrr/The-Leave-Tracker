-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "OrganisationCalendarIntegration" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "calendarId" TEXT,
    "connectedByUserId" UUID,
    "googleSubject" TEXT,
    "encryptedRefreshToken" TEXT,
    "invitationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationCalendarIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleOAuthState" (
    "id" UUID NOT NULL,
    "stateHash" TEXT NOT NULL,
    "browserNonceHash" TEXT NOT NULL,
    "encryptedVerifier" TEXT NOT NULL,
    "organisationId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "integrationRevision" INTEGER NOT NULL,
    "actorUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncJob" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "calendarEventId" UUID NOT NULL,
    "integrationRevision" INTEGER NOT NULL,
    "eventRevision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'UPSERT',
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "lastErrorCode" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalCalendarEvent" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "calendarEventId" UUID NOT NULL,
    "integrationRevision" INTEGER NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "etag" TEXT,
    "payloadHash" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL,
    "invitationStatus" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationCalendarIntegration_organisationId_key" ON "OrganisationCalendarIntegration"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationCalendarIntegration_id_organisationId_key" ON "OrganisationCalendarIntegration"("id", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleOAuthState_stateHash_key" ON "GoogleOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "GoogleOAuthState_expiresAt_idx" ON "GoogleOAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "CalendarSyncJob_state_nextAttemptAt_idx" ON "CalendarSyncJob"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CalendarSyncJob_organisationId_createdAt_idx" ON "CalendarSyncJob"("organisationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSyncJob_integrationId_calendarEventId_integrationRe_key" ON "CalendarSyncJob"("integrationId", "calendarEventId", "integrationRevision", "eventRevision", "operation");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCalendarEvent_integrationId_calendarEventId_integra_key" ON "ExternalCalendarEvent"("integrationId", "calendarEventId", "integrationRevision");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCalendarEvent_googleCalendarId_googleEventId_key" ON "ExternalCalendarEvent"("googleCalendarId", "googleEventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_id_organisationId_key" ON "CalendarEvent"("id", "organisationId");

-- AddForeignKey
ALTER TABLE "OrganisationCalendarIntegration" ADD CONSTRAINT "OrganisationCalendarIntegration_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationCalendarIntegration" ADD CONSTRAINT "OrganisationCalendarIntegration_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleOAuthState" ADD CONSTRAINT "GoogleOAuthState_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleOAuthState" ADD CONSTRAINT "GoogleOAuthState_integrationId_organisationId_fkey" FOREIGN KEY ("integrationId", "organisationId") REFERENCES "OrganisationCalendarIntegration"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleOAuthState" ADD CONSTRAINT "GoogleOAuthState_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "CalendarSyncJob_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "CalendarSyncJob_integrationId_organisationId_fkey" FOREIGN KEY ("integrationId", "organisationId") REFERENCES "OrganisationCalendarIntegration"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "CalendarSyncJob_calendarEventId_organisationId_fkey" FOREIGN KEY ("calendarEventId", "organisationId") REFERENCES "CalendarEvent"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_integrationId_organisationId_fkey" FOREIGN KEY ("integrationId", "organisationId") REFERENCES "OrganisationCalendarIntegration"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_calendarEventId_organisationId_fkey" FOREIGN KEY ("calendarEventId", "organisationId") REFERENCES "CalendarEvent"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Credentials and outbox rows are accessible only through the server database role.
ALTER TABLE "OrganisationCalendarIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleOAuthState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarSyncJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExternalCalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganisationCalendarIntegration" ADD CONSTRAINT "calendar_connection_status" CHECK (status IN ('DISCONNECTED','CONNECTED','REAUTH_REQUIRED'));
ALTER TABLE "OrganisationCalendarIntegration" ADD CONSTRAINT "connected_calendar_credentials" CHECK (status <> 'CONNECTED' OR ("encryptedRefreshToken" IS NOT NULL AND "googleSubject" IS NOT NULL));
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "calendar_job_state" CHECK (state IN ('PENDING','PROCESSING','SUCCEEDED','RETRY','FAILED','CANCELLED'));
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "calendar_job_operation" CHECK (operation IN ('UPSERT','DELETE'));
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "calendar_job_attempts" CHECK (attempts >= 0 AND "eventRevision" > 0 AND "integrationRevision" > 0);
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "calendar_event_revision" CHECK (revision > 0);
