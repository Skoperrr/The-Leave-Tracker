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
export type ApiEnvelope<T> = {
  data: T;
  meta?: { page: number; pageSize: number; total: number };
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
