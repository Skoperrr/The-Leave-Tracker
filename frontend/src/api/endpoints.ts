import { apiClient } from "./client";
import type {
  AdminAllocation,
  GoogleCalendar,
  GoogleStatus,
  CalendarEvent,
  CreatedLeaveRequests,
  CreateLeaveRequest,
  LeaveBalance,
  LeaveDecision,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  Me,
  Membership,
} from "../types/api";
export type RequestFilters = {
  organisationId?: string;
  status?: LeaveStatus;
  page?: number;
  pageSize?: number;
};
function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return `?${params.toString()}`;
}
const segment = encodeURIComponent;
export const api = {
  profile: (fullName: string, signal?: AbortSignal) =>
    apiClient<Me>("/auth/profile", {
      method: "POST",
      body: { fullName },
      signal,
    }),
  assignMembership: (body: {
    organisationId: string;
    email: string;
    managerMembershipId?: string;
  }) => apiClient<Membership>("/admin/memberships", { method: "POST", body }),
  allocate: (body: {
    organisationId: string;
    membershipId: string;
    leaveTypeId: string;
    year: number;
    allocatedDays: number;
  }) =>
    apiClient<AdminAllocation>("/admin/allocations", { method: "POST", body }),
  googleStatus: (organisationId: string, signal?: AbortSignal) =>
    apiClient<GoogleStatus>(
      `/integrations/google/status${query({ organisationId })}`,
      { signal },
    ),
  googleConnect: (organisationId: string) =>
    apiClient<{ authorisationUrl: string; expiresAt: string }>(
      `/integrations/google/connect${query({ organisationId })}`,
      { credentials: "include" },
    ),
  googleCalendars: (
    organisationId: string,
    cursor?: string,
    signal?: AbortSignal,
  ) =>
    apiClient<GoogleCalendar[], { nextPageToken: string | null }>(
      `/integrations/google/calendars${query({ organisationId, cursor })}`,
      { signal },
    ),
  googleSettings: (
    organisationId: string,
    body: { calendarId?: string; invitationsEnabled?: boolean },
  ) =>
    apiClient<GoogleStatus>(
      `/integrations/google/settings${query({ organisationId })}`,
      { method: "PATCH", body },
    ),
  googleTest: (organisationId: string) =>
    apiClient<{ calendarId: string; writable: true; checkedAt: string }>(
      `/integrations/google/test${query({ organisationId })}`,
      { method: "POST" },
    ),
  googleDisconnect: (organisationId: string) =>
    apiClient<GoogleStatus>(
      `/integrations/google/disconnect${query({ organisationId })}`,
      { method: "DELETE" },
    ),
  googleRetry: (organisationId: string, jobId: string) =>
    apiClient<GoogleStatus>("/integrations/google/retry", {
      method: "POST",
      body: { organisationId, jobId },
    }),
  me: (signal?: AbortSignal) => apiClient<Me>("/me", { signal }),
  leaveTypes: (organisationId: string, signal?: AbortSignal) =>
    apiClient<LeaveType[]>(
      `/organisations/${segment(organisationId)}/leave-types`,
      { signal },
    ),
  balances: (organisationId: string, year: number, signal?: AbortSignal) =>
    apiClient<LeaveBalance[]>(`/balances${query({ organisationId, year })}`, {
      signal,
    }),
  requests: (filters: RequestFilters, signal?: AbortSignal) =>
    apiClient<LeaveRequest[]>(`/leave-requests${query(filters)}`, { signal }),
  managerRequests: (
    filters: RequestFilters & { organisationId: string },
    signal?: AbortSignal,
  ) =>
    apiClient<LeaveRequest[]>(`/manager/leave-requests${query(filters)}`, {
      signal,
    }),
  createRequest: (body: CreateLeaveRequest) =>
    apiClient<CreatedLeaveRequests>("/leave-requests", {
      method: "POST",
      body,
    }),
  cancelRequest: (id: string) =>
    apiClient<LeaveRequest>(`/leave-requests/${segment(id)}/cancel`, {
      method: "POST",
    }),
  decideRequest: (id: string, body: LeaveDecision) =>
    apiClient<LeaveRequest>(`/manager/leave-requests/${segment(id)}/decision`, {
      method: "POST",
      body,
    }),
  calendar: (
    organisationId: string,
    from: string,
    to: string,
    signal?: AbortSignal,
  ) =>
    apiClient<CalendarEvent[]>(
      `/calendar-events${query({ organisationId, from, to })}`,
      { signal },
    ),
  memberships: (organisationId: string, signal?: AbortSignal) =>
    apiClient<Membership[]>(`/admin/memberships${query({ organisationId })}`, {
      signal,
    }),
};
