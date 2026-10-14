import { Brand } from "./Brand";
import { DominoSpinner } from "./ui";

// Keep the same screen through session verification and profile loading.
export function AuthLoading() {
  return (
    <main className="signin-loading">
      <div className="brand">
        <Brand />
      </div>
      <div className="signin-loading-content" role="status" aria-live="polite">
        <div className="signin-loading-animation">
          <DominoSpinner />
        </div>
        <h1>Opening your workspace…</h1>
        <p>Getting your workspace ready.</p>
      </div>
    </main>
  );
}
