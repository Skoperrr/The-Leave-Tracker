import { apiClient } from "./client";
import type { InsightsFilters, InsightsResult } from "../types/insights";
export function fetchInsights(filters: InsightsFilters, signal?: AbortSignal) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) =>
    params.set(key, String(value)),
  );
  return apiClient<InsightsResult>(`/insights?${params}`, { signal });
}
