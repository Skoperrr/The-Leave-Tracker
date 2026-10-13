import { apiClient } from "./client";
import type {
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
