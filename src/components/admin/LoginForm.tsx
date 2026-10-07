"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";
import PasswordInput from "@/components/admin/PasswordInput";

// /admin/login: email + password, or (second mode) request a reset link.

type Mode = "sign-in" | "forgot";

async function post(path: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

export default function LoginForm({ next, linkFailed }: { next: string; linkFailed: boolean }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function switchMode(to: Mode) {
    setMode(to);
    setError("");
    setSent(false);
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { ok, json } = await post("/api/auth/login", { email, password });
      if (!ok) {
        setError(typeof json.error === "string" ? json.error : "Couldn't sign in. Try again.");
        setBusy(false);
        return;
      }
      // A full page load, so the server sees the new session straight away.
      window.location.assign(json.mustChangePassword ? "/admin/reset-password" : next);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function requestLink(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/forgot-password", { email });
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const emailField = (
    <Field id="email" label="Email">
      <input
        id="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        className={inputClass()}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </Field>
  );

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-blue">{mode === "sign-in" ? "Sign in to the admin" : "Reset your password"}</h1>
        {mode === "forgot" && (
          <p className="text-sm text-ink-2">Enter your admin email and we&apos;ll send you a link to set a new password.</p>
        )}
      </div>

      {linkFailed && mode === "sign-in" && !error && (
        <Alert tone="error" title="That link didn't work">
          Reset links expire after an hour and work only once, in the browser where you asked for them. Ask for a new
          one below.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {mode === "sign-in" ? (
        <form onSubmit={signIn} noValidate className="space-y-5">
          {emailField}
          <Field id="password" label="Password">
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
            Sign in
          </Button>
          <Button type="button" variant="ghost" onClick={() => switchMode("forgot")} className="w-full">
            Forgot your password?
          </Button>
        </form>
      ) : sent ? (
        <div className="space-y-5">
          <Alert tone="success" title="Check your email">
            If {email.trim()} belongs to an admin, a reset link is on its way. Open it in this browser within an hour.
          </Alert>
          <Button type="button" variant="outline" onClick={() => switchMode("sign-in")} className="w-full">
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={requestLink} noValidate className="space-y-5">
          {emailField}
          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
            Send reset link
          </Button>
          <Button type="button" variant="ghost" onClick={() => switchMode("sign-in")} className="w-full">
            Back to sign in
          </Button>
        </form>
      )}
    </Card>
  );
}
