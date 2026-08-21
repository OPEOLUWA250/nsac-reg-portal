import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { roleAccent } from "@/lib/role-style";

type ButtonVariant = "gold" | "navy" | "outline" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  gold: "bg-gold text-navy hover:bg-gold-light shadow-sm shadow-gold/30",
  navy: "bg-navy text-white hover:bg-blue-2",
  outline: "border border-navy/20 text-navy hover:bg-navy/5",
  ghost: "text-navy/60 hover:text-navy",
};

export function Button({
  variant = "navy",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-navy/10 bg-white shadow-[0_1px_2px_rgba(10,26,49,0.04),0_10px_28px_-12px_rgba(10,26,49,0.18)] ${className}`}
      {...props}
    />
  );
}

export function Kicker({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[11px] font-bold uppercase tracking-[0.22em] text-gold ${className}`}
    >
      {children}
    </span>
  );
}

export function RolePill({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-navy/15 bg-navy/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-navy whitespace-nowrap">
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ background: roleAccent(role) }}
      />
      {role}
    </span>
  );
}

export function StatusPill({ checkedIn }: { checkedIn: boolean }) {
  if (checkedIn) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 border border-gold/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-navy whitespace-nowrap">
        Checked in
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-navy/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-navy/50 whitespace-nowrap">
      Not checked in
    </span>
  );
}
