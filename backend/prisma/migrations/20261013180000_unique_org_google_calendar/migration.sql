-- Canonical Google calendar IDs are unique across organisation connections.
-- Disconnection clears calendarId; existing external events remain mapped.
CREATE UNIQUE INDEX "OrganisationCalendarIntegration_calendarId_key"
ON "OrganisationCalendarIntegration"("calendarId");
