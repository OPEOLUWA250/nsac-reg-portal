import type { Metadata } from "next";
import StudentCodesPanel from "@/components/admin/StudentCodesPanel";

export const metadata: Metadata = {
  title: "Student codes",
  description: "Staff: personal codes that unlock the Student ticket for verified students.",
  robots: { index: false },
};

export default function AdminStudentCodesPage() {
  return <StudentCodesPanel />;
}
