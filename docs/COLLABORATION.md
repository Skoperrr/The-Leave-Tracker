# Backend/frontend collaboration

Victor owns backend, schema/migrations and backend documentation on `backend/victor`. Kopano owns React + Vite on `frontend/kopano`. No frontend files were modified. No automatic commits, merges or pushes were performed. Review logical changes through pull requests; agree on contract changes before either side implements them.

## What Kopano can use now

The health endpoint is available at `http://localhost:3001/api/v1/health`. Configure `VITE_API_URL=http://localhost:3001`. CORS allows `http://localhost:5173`, including preflight for Authorization and Content-Type. The backend and future frontend are separate npm projects. Only health is operational; there is no sign-in or business API yet.

## Planned integration sequence

1. Sign in with the browser Supabase SDK and obtain the session access token. Send `Authorization: Bearer <access_token>` on each protected request. Never send a service role key or fabricated role/user flags.
2. Read `/api/v1/me`; select an active membership's organisationId. Fetch its leave types and `/balances?organisationId=...&year=2026`.
3. Submit `/leave-requests` using organisationIds, leaveTypeCode, startDate, endDate and optional reason from the exact shared contract. Display each child request's status.
4. Fetch own paginated requests; cancel a single pending child by its ID. Refetch balances and history after mutations.
5. Managers use organisationId to fetch their queue and send decision APPROVE/DECLINE. Decline requires a comment. Refetch queue, balance and calendar after a successful decision.
6. Read `/calendar-events?organisationId=...&from=2026-11-01&to=2026-11-30`. Dates are inclusive; events must contain no private reason. Only the approved organisation's event appears after a partial approval.

Future authenticated TypeScript call pattern (pending backend):

```ts
type ApiError = { error: { code: string; message: string; details: Record<string, unknown> } };
export async function apiCall<T>(base: string, path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${base}/api/v1${path}`, { ...init, headers });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const failure = payload as ApiError;
    throw new Error(`${failure.error.code}: ${failure.error.message}`);
  }
  return payload as T;
}
```

Successful payloads are wrapped in data; pagination uses meta. Handle 401 by asking for sign-in, 403 as permission denied, 409 as stale status/overlap and 422 as a business constraint. Use the shared contract's types; do not display local guesses as saved backend state. Client role gating improves UX; backend authorisation must still check every request.

Admin allocation discovery, admin response shapes and audit visibility require agreement before the admin phase. No change to SHARED_API_CONTRACT.md was made at this milestone.
