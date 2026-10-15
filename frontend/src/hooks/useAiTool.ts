import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";

// Manual generation only: never spend Gemini quota on focus/refetch. A real
// leave mutation invalidates the snapshot instead of leaving stale advice up.
export function useAiTool<T>(resetKey: string) {
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const cache = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;
  useEffect(() => {
    const reset = () => {
      controller.current?.abort();
      controller.current = null;
      setResult(null);
      setError(null);
      setBusy(false);
    };
    reset();
    const unsubscribe = cache.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "invalidate" &&
        event.query.queryKey[0] === "api" &&
        event.query.queryKey[1] === userId
      )
        reset();
    });
    return () => {
      unsubscribe();
      controller.current?.abort();
      controller.current = null;
    };
  }, [resetKey, userId, cache]);
  async function run(action: (signal: AbortSignal) => Promise<T>) {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const value = await action(request.signal);
      if (controller.current === request && !request.signal.aborted)
        setResult(value);
    } catch (caught) {
      if (controller.current === request && !request.signal.aborted)
        setError(caught);
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  return { result, error, busy, run };
}
