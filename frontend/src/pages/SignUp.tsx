import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../auth/supabase";
import { ErrorNotice, FieldError } from "../components/ui";
const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(120),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });
export function SignUp() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <main className="standalone">
      <section className="panel onboarding-panel">
        <p className="eyebrow">THE LEAVE TRACKER</p>
        <h1>Create your account</h1>
        {sent ? (
          <div role="status">
            <h2>Check your email</h2>
            <p>
              If your signup can be processed, you will receive a confirmation
              email. Confirm your email, then sign in. Organisation access is
              assigned by an administrator.
            </p>
          </div>
        ) : (
          <>
            <p>
              Sign up with your email. An administrator will assign your
              organisation access and leave allocation.
            </p>
            {!supabase && (
              <p className="notice">
                Account registration is not configured yet.
              </p>
            )}
            <form
              noValidate
              onSubmit={handleSubmit(async (values) => {
                if (!supabase) return;
                setError(null);
                try {
                  const { data, error } = await supabase.auth.signUp({
                    email: values.email,
                    password: values.password,
                    options: {
                      data: { full_name: values.fullName },
                      emailRedirectTo: `${window.location.origin}/sign-in`,
                    },
                  });
                  if (
                    error &&
                    !["user_already_exists", "email_exists"].includes(
                      error.code ?? "",
                    )
                  )
                    throw error;
                  if (data.session)
                    await supabase.auth.signOut({ scope: "local" });
                  setSent(true);
                } catch (error) {
                  setError(error);
                }
              })}
            >
              <label htmlFor="signup-name">Full name</label>
              <input
                id="signup-name"
                autoComplete="name"
                {...register("fullName")}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby="signup-name-error"
              />
              <FieldError
                id="signup-name-error"
                message={errors.fullName?.message}
              />
              <label htmlFor="signup-email">Email address</label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                {...register("email")}
                aria-invalid={Boolean(errors.email)}
                aria-describedby="signup-email-error"
              />
              <FieldError
                id="signup-email-error"
                message={errors.email?.message}
              />
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                {...register("password")}
                aria-invalid={Boolean(errors.password)}
                aria-describedby="signup-password-error"
              />
              <FieldError
                id="signup-password-error"
                message={errors.password?.message}
              />
              <label htmlFor="signup-confirm">Confirm password</label>
              <input
                id="signup-confirm"
                type="password"
                autoComplete="new-password"
                {...register("confirmPassword")}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby="signup-confirm-error"
              />
              <FieldError
                id="signup-confirm-error"
                message={errors.confirmPassword?.message}
              />
              {error ? <ErrorNotice error={error} /> : null}
              <button
                className="primary full"
                disabled={!supabase || isSubmitting}
              >
                {isSubmitting ? "Creating account…" : "Create account"}
              </button>
            </form>
          </>
        )}
        <p className="signin-help">
          <Link to="/sign-in">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
