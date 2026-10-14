import {
  Component,
  lazy,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Link, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireRole } from "./auth/Guards";
import { AppLayout } from "./layouts/AppLayout";
import { SignUp } from "./pages/SignUp";
import { ForgotPassword, ResetPassword } from "./pages/PasswordRecovery";
import { CalendarSettings } from "./pages/CalendarSettings";
import { SignIn } from "./pages/SignIn";
import { Dashboard } from "./pages/Dashboard";
import { NewRequest } from "./pages/NewRequest";
import { MyRequests } from "./pages/MyRequests";
import { ManagerInbox } from "./pages/ManagerInbox";
import { Calendar } from "./pages/Calendar";
import { Admin } from "./pages/Admin";
import { Loading } from "./components/ui";
const DashboardPreview = import.meta.env.DEV
  ? lazy(() => import("./dev/DashboardPreview"))
  : null;
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Do not log tokens or private request data. */
  }
  render() {
    return this.state.failed ? (
      <main className="standalone">
        <div className="panel">
          <h1>Unable to display this page</h1>
          <p>
            Please reload the workspace. If the problem continues, contact your
            administrator.
          </p>
          <button
            className="primary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload workspace
          </button>
        </div>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  return (
    <Routes>
      {DashboardPreview && (
        <Route
          path="/preview/dashboard"
          element={
            <Suspense fallback={<Loading label="Loading dashboard preview" />}>
              <DashboardPreview />
            </Suspense>
          }
        />
      )}
      {DashboardPreview && (
        <Route
          path="/preview/calendar"
          element={
            <Suspense fallback={<Loading label="Loading calendar preview" />}>
              <DashboardPreview calendar />
            </Suspense>
          }
        />
      )}
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="requests/new" element={<NewRequest />} />
          <Route path="requests" element={<MyRequests />} />
          <Route path="calendar" element={<Calendar />} />
          <Route element={<RequireRole roles={["MANAGER", "ADMIN"]} />}>
            <Route path="manager" element={<ManagerInbox />} />
          </Route>
          <Route element={<RequireRole roles={["ADMIN"]} />}>
            <Route path="admin" element={<Admin />} />
            <Route path="admin/calendar" element={<CalendarSettings />} />
            <Route path="admin/approvals" element={<ManagerInbox />} />
          </Route>
          <Route
            path="*"
            element={
              <section className="panel">
                <h1>Page not found</h1>
                <p>This page is unavailable.</p>
                <Link to="/">Return to overview</Link>
              </section>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
