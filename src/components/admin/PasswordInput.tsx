"use client";

import { useState, type InputHTMLAttributes } from "react";
import { inputClass } from "@/components/ui";
import { IconEye, IconEyeOff } from "@/components/icons";

// A password field with a show/hide button inside its right edge.
export default function PasswordInput({
  invalid = false,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { invalid?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        className={inputClass(invalid, `pr-14 ${className}`)}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-md text-ink-3 transition-colors duration-150 hover:text-ink"
      >
        <span className="sr-only">{shown ? "Hide password" : "Show password"}</span>
        {shown ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}
