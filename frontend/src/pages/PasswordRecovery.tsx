import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../auth/supabase";
import { useAuth } from "../auth/AuthProvider";
import { FieldError, Loading, SignOutButton } from "../components/ui";

const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});
const passwordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });

export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
  });
  return (
    <main className="standalone">
      <section className="panel onboarding-panel">
        <p className="eyebrow">THE LEAVE TRACKER</p>
        <h1>Forgot your password?</h1>
        {sent ? (
          <div role="status">
            <h2>Check your email</h2>
            <p>
              If an account can receive a reset email, we will send a link. Open
              it to choose a new password.
            </p>
          </div>
        ) : (
          <>
            <p>Enter your account email to request a password reset link.</p>
            {!supabase && (
              <p className="notice">Password recovery is not configured yet.</p>
            )}
            {failed && (
              <p className="notice error" role="alert">
                Unable to send the reset request. Check your connection and try
                again shortly.
              </p>
            )}
            <form
              noValidate
              onSubmit={handleSubmit(async ({ email }) => {
                if (!supabase) return;
                setFailed(false);
                try {
                  const { error } = await supabase.auth.resetPasswordForEmail(
                    email,
                    {
                      redirectTo: `${window.location.origin}/reset-password`,
                    },
                  );
                  // Do not disclose whether the address belongs to an account.
                  if (
                    error &&
                    !["user_not_found", "email_not_found"].includes(
                      error.code ?? "",
                    )
                  )
                    throw error;
                  setSent(true);
                } catch {
                  setFailed(true);
                }
              })}
            >
              <label htmlFor="recovery-email">Email address</label>
              <input
                id="recovery-email"
                type="email"
                autoComplete="email"
                {...register("email")}
                aria-invalid={Boolean(errors.email)}
                aria-describedby="recovery-email-error"
              />
              <FieldError
                id="recovery-email-error"
                message={errors.email?.message}
              />
              <button
                className="primary full"
                disabled={!supabase || isSubmitting}
              >
                {isSubmitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <p>
          <Link to="/sign-in">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}

export function ResetPassword() {
  const { session, loading, recovering } = useAuth();
  const [saved, setSaved] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
  });
  if (loading) return <Loading label="Checking your reset link" />;
  return (
    <main className="standalone">
      <section className="panel onboarding-panel">
        <p className="eyebrow">THE LEAVE TRACKER</p>
        <h1>Reset your password</h1>
        {saved ? (
          <div role="status">
            <h2>Password updated</h2>
            <p>
              Your password has been changed. Sign in with your new password.
            </p>
            {signOutFailed && (
              <div className="notice" role="alert">
                <p>
                  Your password was saved, but your recovery session could not
                  be closed. Sign out before signing in again.
                </p>
                <SignOutButton />
              </div>
            )}
            <Link to="/sign-in">Sign in</Link>
          </div>
        ) : !session || !recovering ? (
          <>
            <p>
              This reset link is missing or has expired. Request a new link and
              keep this page open until you finish.
            </p>
            <Link to="/forgot-password">Request a new reset link</Link>
          </>
        ) : (
          <>
            <p>Choose a new password with at least 8 characters.</p>
            {failed && (
              <p className="notice error" role="alert">
                Unable to complete the password reset. Check your connection,
                try a different password, or request a new link.
              </p>
            )}
            <form
              noValidate
              onSubmit={handleSubmit(async ({ password }) => {
                if (!supabase) return;
                setFailed(false);
                try {
                  const { error } = await supabase.auth.updateUser({
                    password,
                  });
                  if (error) throw error;
                  reset();
                  setSaved(true);
                  // End the recovery session before returning to the workspace.
                  try {
                    const signedOut = await supabase.auth.signOut({
                      scope: "local",
                    });
                    if (signedOut.error) throw signedOut.error;
                  } catch {
                    setSignOutFailed(true);
                  }
                } catch {
                  setFailed(true);
                }
              })}
            >
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                {...register("password")}
                aria-invalid={Boolean(errors.password)}
                aria-describedby="new-password-error"
              />
              <FieldError
                id="new-password-error"
                message={errors.password?.message}
              />
              <label htmlFor="confirm-new-password">Confirm new password</label>
              <input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                {...register("confirmPassword")}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby="confirm-new-password-error"
              />
              <FieldError
                id="confirm-new-password-error"
                message={errors.confirmPassword?.message}
              />
              <button
                className="primary full"
                disabled={!supabase || isSubmitting}
              >
                {isSubmitting ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
