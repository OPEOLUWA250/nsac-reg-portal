import type { Attendee } from "@/lib/types";
import { roleAccent } from "@/lib/role-style";

export default function Badge({ attendee }: { attendee: Pick<Attendee, "full_name" | "role" | "organization"> }) {
  const accent = roleAccent(attendee.role);

  return (
    <div id="badge-print-root" className="badge-print">
      <div className="badge-card">
        <div className="badge-accent-bar" style={{ background: accent }} />
        <div className="badge-body">
          <div className="badge-kicker">NewSpace Africa Conference</div>
          <div className="badge-name">{attendee.full_name}</div>
          {attendee.organization && (
            <div className="badge-org">{attendee.organization}</div>
          )}
          {attendee.role && <span className="badge-role">{attendee.role}</span>}
        </div>
        <div className="badge-footer">Official Attendee Badge</div>
      </div>
    </div>
  );
}
