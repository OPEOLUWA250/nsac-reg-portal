"use client";

import { faPrint } from "@fortawesome/free-solid-svg-icons";
import FaIcon from "@/components/FaIcon";
import { Button } from "@/components/ui";

export default function PrintButton({ children }: { children: string }) {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <FaIcon icon={faPrint} />
      {children}
    </Button>
  );
}
