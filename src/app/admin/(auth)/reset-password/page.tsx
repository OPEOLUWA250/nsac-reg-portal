import type { Metadata } from "next";
import ResetPasswordForm from "@/components/admin/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false },
};

export default function AdminResetPasswordPage() {
  return <ResetPasswordForm />;
}
