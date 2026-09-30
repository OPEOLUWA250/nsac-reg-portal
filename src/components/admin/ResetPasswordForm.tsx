"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field } from "@/components/ui";
import PasswordInput from "@/components/admin/PasswordInput";
import { ADMIN_PASSWORD_MIN, passwordProblem } from "@/lib/admin-password";

// /admin/reset-password: reached from a reset email, after signing in with a
// temporary password, or from the profile menu ("Change password").

export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password);
    const mismatch = !problem && password !== confirm ? "The two passwords don't match." : undefined;
    setErrors({ password: problem ?? undefined, confirm: mismatch });
    if (problem || mismatch) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(30_000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.assign("/admin/login?next=/admin/reset-password");
        return;
      }
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Couldn't change the password. Try again.");
        setBusy(false);
        return;
      }
      window.location.assign("/admin");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-blue">Set a new password</h1>
        <p className="text-sm text-ink-2">
          At least {ADMIN_PASSWORD_MIN} characters. A short sentence you&apos;ll remember works well.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field id="new-password" label="New password" error={errors.password}>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            required
            minLength={ADMIN_PASSWORD_MIN}
            invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "new-password-error" : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field id="confirm-password" label="Type it again" error={errors.confirm}>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            required
            invalid={Boolean(errors.confirm)}
            aria-describedby={errors.confirm ? "confirm-password-error" : undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
          Save password
        </Button>
      </form>
    </Card>
  );
}
