// Inspect errors for diagnosis without returning their messages or connection details.
export function databaseFailureCategory(error: unknown): string {
  const seen = new Set<unknown>();
  const codes = new Set<string>();
  const messages: string[] = [];
  const inspect = (value: unknown, depth: number) => {
    if (depth > 6 || typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (['code', 'originalCode', 'kind'].includes(key) && typeof entry === 'string') codes.add(entry);
      if (['message', 'originalMessage'].includes(key) && typeof entry === 'string') messages.push(entry);
      if (typeof entry === 'object') inspect(entry, depth + 1);
    }
    if (value instanceof Error) messages.push(value.message);
  };
  inspect(error, 0);
  const message = messages.join(' ').toLowerCase();
  if (codes.has('28P01') || /password authentication|authentication failed|tenant or user not found/.test(message)) return 'authentication';
  if (/certificate|ssl|tls/.test(message)) return 'TLS certificate';
  if (codes.has('ENOTFOUND') || codes.has('EAI_AGAIN')) return 'DNS resolution';
  if (codes.has('ECONNREFUSED')) return 'connection refused';
  if (/timeout|timed out/.test(message) || codes.has('ETIMEDOUT')) return 'connection timeout';
  if (codes.has('42501')) return 'database permissions';
  return 'connection or configuration';
}
