export type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";
export type LeaveStatus = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";
export type Organization = { id: string; name: string; slug: string };
export type Membership = {
  id: string;
  organisationId: string;
  organisationName: string;
  role: Role;
  managerMembershipId: string | null;
  active: boolean;
};
export type Me = {
  id: string;
  email: string;
  fullName: string;
  memberships: Membership[];
};
export type LeaveType = {
  id: string;
  organisationId: string;
  code: string;
  name: string;
};
export type LeaveBalance = {
  membershipId: string;
  leaveTypeId: string;
  year: number;
  allocatedDays: number;
  approvedDays: number;
  pendingDays: number;
  remainingDays: number;
};
export type LeaveRequest = {
  id: string;
  groupId: string | null;
  membershipId: string;
  organisationId: string;
  organisationName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string | null;
  status: LeaveStatus;
  submittedAt: string;
  approverName: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  employeeDisplayName?: string;
  employeeId?: string;
};
export type CalendarEvent = {
  id: string;
  organisationId: string;
  requestId: string;
  employeeDisplayName: string;
  title: string;
  startDate: string;
  endDate: string;
  allDay: true;
};
export type PaginationMeta = { page: number; pageSize: number; total: number };
export type ApiEnvelope<T, Meta = PaginationMeta> = {
  data: T;
  meta?: Meta;
};
export type ApiError = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};
export type CreateLeaveRequest = {
  organisationIds: string[];
  leaveTypeCode: string;
  startDate: string;
  endDate: string;
  reason?: string;
};
export type CreatedLeaveRequests = {
  groupId: string;
  requests: LeaveRequest[];
};
export type LeaveDecision = {
  decision: "APPROVE" | "DECLINE";
  comment?: string;
};

export type AdminAllocation = {
  id: string;
  organisationId: string;
  membershipId: string;
  leaveTypeId: string;
  year: number;
  allocatedDays: number;
  createdAt: string;
  updatedAt: string;
};
export type GoogleCalendar = {
  id: string;
  summary: string;
  timeZone: string;
  accessRole: string;
};
export type GoogleStatus = {
  organisationId: string;
  provider: "GOOGLE";
  connectionStatus: "DISCONNECTED" | "CONNECTED" | "REAUTH_REQUIRED";
  calendarId: string | null;
  invitationsEnabled: boolean;
  lastSync: null | {
    jobId: string;
    status:
      "PENDING" | "PROCESSING" | "SUCCEEDED" | "RETRY" | "FAILED" | "CANCELLED";
    attemptedAt: string | null;
    errorCode: string | null;
    invitationStatus: string | null;
    recipientCount: number | null;
  };
};
