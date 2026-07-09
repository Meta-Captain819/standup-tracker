"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z, type ZodType } from "zod";
import { Button } from "@/app/_components/Button";
import { Card } from "@/app/_components/Card";
import { FormField } from "@/app/_components/FormField";
import { InlineError } from "@/app/_components/InlineError";
import { TextField } from "@/app/_components/TextField";
import { requestJson } from "@/app/_lib/api/client";
import { useCapturedTimezone } from "@/app/_lib/timezone";
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/app/_lib/validation/identity";

type FormStatus = "idle" | "submitting" | "done";
type FieldErrors = Record<string, string>;

function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  return error.issues.reduce<FieldErrors>((fields, issue) => {
    const key = issue.path[0];
    if (typeof key === "string" && !fields[key]) {
      fields[key] = issue.message;
    }
    return fields;
  }, {});
}

/**
 * The shared submit flow behind every auth form: client-side Zod validation (merging any hook-captured
 * `extra` such as timezone or an invite/reset token), one POST to the BFF, and the idle→submitting→done
 * status plus per-field / form-level error wiring. Each form supplies only its schema, endpoint, and a
 * success action (redirect, or fall through to the "done" state).
 */
function useAuthForm<T>(options: {
  schema: ZodType<T>;
  endpoint: string;
  extra?: Record<string, unknown>;
  fallbackError: string;
  onSuccess?: () => void;
}) {
  const { schema, endpoint, extra, fallbackError, onSuccess } = options;
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = schema.safeParse({ ...raw, ...extra });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    setStatus("submitting");
    try {
      await requestJson(endpoint, { method: "POST", body: JSON.stringify(parsed.data) });
      onSuccess?.();
      setStatus("done");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : fallbackError);
      setStatus("idle");
    }
  }

  return { status, errors, formError, onSubmit };
}

function AuthShell({
  title,
  description,
  error,
  children,
}: {
  title: string;
  description: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-md">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
        <p className="text-sm text-neutral-500">{description}</p>
      </div>
      <div className="space-y-4">
        {children}
        {error && <InlineError message={error} />}
      </div>
    </Card>
  );
}

export function SignInForm() {
  const timezone = useCapturedTimezone();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, errors, formError, onSubmit } = useAuthForm({
    schema: loginSchema,
    endpoint: "/api/auth/login",
    extra: { timezone },
    fallbackError: "Sign in failed.",
    onSuccess: () => {
      router.replace(searchParams.get("next") ?? "/dashboard");
      router.refresh();
    },
  });

  return (
    <AuthShell title="Sign in" description="Continue to your team's standup space." error={formError}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Email" htmlFor="email" error={errors.email}>
          <TextField id="email" name="email" type="email" autoComplete="email" invalid={!!errors.email} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password}>
          <TextField id="password" name="password" type="password" autoComplete="current-password" invalid={!!errors.password} />
        </FormField>
        <Button type="submit" className="w-full" isLoading={status === "submitting"}>
          Sign in
        </Button>
      </form>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link href="/forgot-password" className="text-brand-700 hover:text-brand-800">
          Forgot password
        </Link>
        <Link href="/start-a-team" className="text-brand-700 hover:text-brand-800">
          Start a new team
        </Link>
      </div>
    </AuthShell>
  );
}

export function StartTeamForm() {
  const timezone = useCapturedTimezone();
  const router = useRouter();
  const { status, errors, formError, onSubmit } = useAuthForm({
    schema: signupSchema,
    endpoint: "/api/auth/signup",
    extra: { timezone },
    fallbackError: "Team creation failed.",
    onSuccess: () => {
      router.replace("/dashboard");
      router.refresh();
    },
  });

  return (
    <AuthShell title="Start a new team" description="Create the first admin account for your team." error={formError}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Your name" htmlFor="name" error={errors.name}>
          <TextField id="name" name="name" autoComplete="name" invalid={!!errors.name} />
        </FormField>
        <FormField label="Email" htmlFor="email" error={errors.email}>
          <TextField id="email" name="email" type="email" autoComplete="email" invalid={!!errors.email} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password}>
          <TextField id="password" name="password" type="password" autoComplete="new-password" invalid={!!errors.password} />
        </FormField>
        <FormField label="Team name" htmlFor="teamName" error={errors.teamName}>
          <TextField id="teamName" name="teamName" invalid={!!errors.teamName} />
        </FormField>
        <Button type="submit" className="w-full" isLoading={status === "submitting"}>
          Create team
        </Button>
      </form>
      <Link href="/signin" className="text-sm text-brand-700 hover:text-brand-800">
        Sign in instead
      </Link>
    </AuthShell>
  );
}

export function ForgotPasswordForm() {
  const { status, errors, formError, onSubmit } = useAuthForm({
    schema: forgotPasswordSchema,
    endpoint: "/api/auth/password/forgot",
    fallbackError: "Password reset request failed.",
  });

  return (
    <AuthShell title="Reset your password" description="If the email exists, a reset link will be sent." error={formError}>
      {status === "done" ? (
        <p className="text-sm text-neutral-600">Check your email for the next step.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Email" htmlFor="email" error={errors.email}>
            <TextField id="email" name="email" type="email" autoComplete="email" invalid={!!errors.email} />
          </FormField>
          <Button type="submit" className="w-full" isLoading={status === "submitting"}>
            Send reset link
          </Button>
        </form>
      )}
      <Link href="/signin" className="text-sm text-brand-700 hover:text-brand-800">
        Back to sign in
      </Link>
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { status, errors, formError, onSubmit } = useAuthForm({
    schema: resetPasswordSchema,
    endpoint: "/api/auth/password/reset",
    extra: { token },
    fallbackError: "Password reset failed.",
    onSuccess: () => router.replace("/signin"),
  });

  return (
    <AuthShell title="Choose a new password" description="Use the reset link from your email." error={formError}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="New password" htmlFor="password" error={errors.password || errors.token}>
          <TextField id="password" name="password" type="password" autoComplete="new-password" invalid={!!(errors.password || errors.token)} />
        </FormField>
        <Button type="submit" className="w-full" isLoading={status === "submitting"}>
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}

export function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { status, errors, formError, onSubmit } = useAuthForm({
    schema: acceptInviteSchema,
    endpoint: "/api/auth/invitations/accept",
    extra: { token },
    fallbackError: "Invite acceptance failed.",
    onSuccess: () => router.replace("/signin"),
  });

  return (
    <AuthShell title="Accept invite" description="Set your password to join your team's standups." error={formError}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Password" htmlFor="password" error={errors.password || errors.token}>
          <TextField id="password" name="password" type="password" autoComplete="new-password" invalid={!!(errors.password || errors.token)} />
        </FormField>
        <Button type="submit" className="w-full" isLoading={status === "submitting"}>
          Join team
        </Button>
      </form>
    </AuthShell>
  );
}
