import { EVENT_INFO } from "@/lib/event-info";

// "Add to calendar" for the conference: an .ics file (Apple Calendar,
// Outlook desktop, attached to the confirmation email) and links for Google
// Calendar and Outlook on the web. All-day event across the conference days.

type Lang = "en" | "fr";

const DESCRIPTION = {
  en: `${EVENT_INFO.name.en}, ${EVENT_INFO.place.en}.\nBring your QR ticket (on your phone or printed) to the registration desk to collect your badge.\n${EVENT_INFO.websiteUrl}`,
  fr: `${EVENT_INFO.name.fr}, ${EVENT_INFO.place.fr}.\nPrésentez votre billet QR (sur téléphone ou imprimé) à l'accueil pour récupérer votre badge.\n${EVENT_INFO.websiteUrl}`,
};

/** "2027-04-19" → "20270419" */
function compact(date: string) {
  return date.replace(/-/g, "");
}

/** Calendar end dates for all-day events are exclusive: the day after. */
function dayAfter(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function escapeIcs(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function icsFilename() {
  return "newspace-africa-conference-2027.ics";
}

export function buildIcs(lang: Lang = "en"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Space in Africa//NewSpace Africa Conference//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:nsac-2027-${EVENT_INFO.startDate}@newspace.spaceinafrica.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(EVENT_INFO.startDate)}`,
    `DTEND;VALUE=DATE:${compact(dayAfter(EVENT_INFO.endDate))}`,
    `SUMMARY:${escapeIcs(EVENT_INFO.name[lang])}`,
    `LOCATION:${escapeIcs(EVENT_INFO.place[lang])}`,
    `DESCRIPTION:${escapeIcs(DESCRIPTION[lang])}`,
    `URL:${EVENT_INFO.websiteUrl}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function googleCalendarUrl(lang: Lang = "en"): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: EVENT_INFO.name[lang],
    dates: `${compact(EVENT_INFO.startDate)}/${compact(dayAfter(EVENT_INFO.endDate))}`,
    location: EVENT_INFO.place[lang],
    details: DESCRIPTION[lang],
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(lang: Lang = "en"): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: EVENT_INFO.name[lang],
    startdt: EVENT_INFO.startDate,
    enddt: dayAfter(EVENT_INFO.endDate),
    allday: "true",
    location: EVENT_INFO.place[lang],
    body: DESCRIPTION[lang],
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}
