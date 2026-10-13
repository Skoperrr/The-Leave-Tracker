import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import type { ApiEnvelope } from "../types/api";
import { api } from "../api/endpoints";
export function useApiQuery<T>(
  key: readonly unknown[],
  queryFn: (signal: AbortSignal) => Promise<ApiEnvelope<T>>,
  enabled = true,
) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["api", session?.user.id, ...key],
    queryFn: ({ signal }) => queryFn(signal),
    enabled: Boolean(session) && enabled,
  });
}
export function useRefreshLeave() {
  const { session } = useAuth();
  const cache = useQueryClient();
  return () =>
    cache.invalidateQueries({
      queryKey: ["api", session?.user.id],
      refetchType: "all",
    });
}
// Consume every documented page so upcoming leave cannot disappear behind history pagination.
export async function allApprovedRequests(
  organisationId: string,
  signal: AbortSignal,
) {
  const requests = [];
  let page = 1;
  while (true) {
    const result = await api.requests(
      { organisationId, status: "APPROVED", page, pageSize: 100 },
      signal,
    );
    requests.push(...result.data);
    if (
      !result.meta ||
      result.data.length === 0 ||
      page * result.meta.pageSize >= result.meta.total
    )
      break;
    page++;
  }
  return { data: requests };
}
