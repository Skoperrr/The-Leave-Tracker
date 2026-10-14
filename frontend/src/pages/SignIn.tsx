import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../auth/supabase";
import { signInSchema, type SignInValues } from "../hooks/validation";
import { ErrorNotice, FieldError, Loading } from "../components/ui";
import { Brand } from "../components/Brand";
export function SignIn() {
  const { session, loading, expired, authError, recovering } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });
  if (loading) return <Loading label="Restoring your session" />;
  if (recovering) return <Navigate to="/reset-password" replace />;
  if (session) {
    const from = (location.state as { from?: string } | null)?.from;
    return (
      <Navigate
        to={
          from?.startsWith("/") && !from.startsWith("//") && from !== "/sign-in"
            ? from
            : "/"
        }
        replace
      />
    );
  }
  return (
    <main className="signin">
      <section className="signin-story">
        <div className="brand">
          <Brand />
        </div>
        <div>
          <p className="eyebrow">A LITTLE SPACE TO RECHARGE</p>
          <h1>
            Good work starts <br />
            with time away.
          </h1>
          <p>
            One place for your leave, your organisations and your team's plans.
          </p>
          <div className="story-art" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <p className="story-footer">Built for people. Made for teams.</p>
      </section>
      <section className="signin-form">
        <div>
          <p className="eyebrow">WELCOME TO THE LEAVE TRACKER</p>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Use your organisation's registered account.</p>
          {!supabase && (
            <div className="notice" role="alert">
              Authentication is not configured. Set VITE_SUPABASE_URL and
              VITE_SUPABASE_ANON_KEY in frontend/.env, then restart Vite.
            </div>
          )}
          {expired && (
            <div className="notice" role="alert">
              Your session expired. Please sign in again.
            </div>
          )}
          {authError && <ErrorNotice error={new Error(authError)} />}
          {error ? <ErrorNotice error={error} /> : null}
          <form
            noValidate
            onSubmit={handleSubmit(async (values) => {
              if (!supabase) return;
              setError(null);
              try {
                const { error } =
                  await supabase.auth.signInWithPassword(values);
                if (error) throw error;
              } catch (error) {
                setError(error);
              }
            })}
          >
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@organisation.com"
              {...register("email")}
              aria-invalid={Boolean(errors.email)}
              aria-describedby="email-error"
            />
            <FieldError id="email-error" message={errors.email?.message} />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
              aria-invalid={Boolean(errors.password)}
              aria-describedby="password-error"
            />
            <FieldError
              id="password-error"
              message={errors.password?.message}
            />
            <button
              className="primary full"
              disabled={!supabase || isSubmitting}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="signin-help">
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <p className="signin-help">
            Need an account? <Link to="/sign-up">Create an account</Link>.
            Contact your administrator for organisation access.
          </p>
        </div>
      </section>
    </main>
  );
}
