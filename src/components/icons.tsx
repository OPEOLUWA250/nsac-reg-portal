import type { ReactNode } from "react";

// Small inline icons (no icon library). They take the text colour.

function Svg({ children, className = "h-[18px] w-[18px]", strokeWidth = 1.8 }: { children: ReactNode; className?: string; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

type P = { className?: string };

export const IconAlert = ({ className }: P) => (
  <Svg className={className} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Svg>
);
export const IconCheck = ({ className }: P) => (
  <Svg className={className} strokeWidth={2.2}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconInfo = ({ className }: P) => (
  <Svg className={className} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5v.01" />
  </Svg>
);
export const IconClose = ({ className }: P) => (
  <Svg className={className} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconMenu = ({ className }: P) => (
  <Svg className={className} strokeWidth={2}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconDownload = ({ className = "h-4 w-4" }: P) => (
  <Svg className={className} strokeWidth={2}>
    <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
  </Svg>
);
export const IconRefresh = ({ className = "h-4 w-4" }: P) => (
  <Svg className={className} strokeWidth={2}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </Svg>
);
export const IconSearch = ({ className = "h-4 w-4" }: P) => (
  <Svg className={className} strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
);
export const IconCalendar = ({ className = "h-4 w-4" }: P) => (
  <Svg className={className} strokeWidth={2}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);
export const IconExternal = ({ className = "h-3.5 w-3.5" }: P) => (
  <Svg className={className} strokeWidth={2}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);
export const IconPin = ({ className = "h-4 w-4" }: P) => (
  <Svg className={className} strokeWidth={2}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
);
export const IconGrid = ({ className }: P) => (
  <Svg className={className}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Svg>
);
export const IconTicket = ({ className }: P) => (
  <Svg className={className}>
    <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
    <path d="M13 6v2m0 3v2m0 3v2" />
  </Svg>
);
export const IconCog = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const IconScan = ({ className }: P) => (
  <Svg className={className}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
  </Svg>
);
export const IconLogout = ({ className }: P) => (
  <Svg className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Svg>
);
export const IconLinkedIn = ({ className = "h-4 w-4" }: P) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
  </svg>
);
export const IconBell = ({ className = "h-5 w-5" }: P) => (
  <Svg className={className}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2.2 2.2 0 0 0 4 0" />
  </Svg>
);
export const IconUser = ({ className = "h-5 w-5" }: P) => (
  <Svg className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
export const IconChevronDown = ({ className = "h-4 w-4" }: P) => (
  <Svg className={className} strokeWidth={2}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const IconTag = ({ className = "h-[18px] w-[18px]" }: P) => (
  <Svg className={className}>
    <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z" />
    <circle cx="8" cy="8" r="1.5" />
  </Svg>
);
export const IconEye = ({ className = "h-5 w-5" }: P) => (
  <Svg className={className}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconEyeOff = ({ className = "h-5 w-5" }: P) => (
  <Svg className={className}>
    <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </Svg>
);
export const IconKey = ({ className = "h-[18px] w-[18px]" }: P) => (
  <Svg className={className}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M10.7 12.3L20 3M16 7l3 3M14 9l2 2" />
  </Svg>
);
export const IconShare = ({ className = "h-4 w-4" }: P) => (
  <Svg className={className} strokeWidth={2}>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
  </Svg>
);
