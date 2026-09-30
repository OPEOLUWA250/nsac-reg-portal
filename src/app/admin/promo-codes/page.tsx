import type { Metadata } from "next";
import PromoCodesPanel from "@/components/admin/PromoCodesPanel";

export const metadata: Metadata = {
  title: "Promo codes",
  description: "Staff: discount codes and complimentary passes for sponsors and partners.",
  robots: { index: false },
};

export default function AdminPromoCodesPage() {
  return <PromoCodesPanel />;
}
