import type { Metadata } from "next";
import LoginForm from "@/components/admin/LoginForm";
import { safeAdminNext } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Admin sign-in",
  robots: { index: false },
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  return (
    <LoginForm next={safeAdminNext(next)} linkFailed={params.error === "link"} timedOut={params.signedOut === "idle"} />
  );
}
