import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ButtonAnchor, Card, Eyebrow, linkClass, RolePill } from "@/components/ui";
import { IconAlert, IconUser } from "@/components/icons";
import SiteLanguageSync from "@/components/SiteLanguageSync";
import { legalLanguage } from "@/components/LegalPage";
import { getPublicContact } from "@/lib/server/public-contact";
import { EVENT_INFO } from "@/lib/event-info";
import { roleLabel } from "@/lib/role-style";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact details of a NewSpace Africa Conference 2027 attendee, shared with their permission.",
  robots: { index: false, follow: false },
};

// Opened by scanning an attendee's QR code with a phone camera (the QR holds
// a link to /p/<code>). Shows their contact details only if they said yes to
// "Can your details be shared?" on the form; otherwise just says so. Staff
// check-in uses the same QR through the scanner, which sees everything.

const COPY = {
  en: {
    shared: "Contact details",
    sharedNote: "Shared with this attendee's permission.",
    notShared: "Details not shared",
    notSharedBody: "This attendee chose not to share their contact details.",
    invalid: "This isn't a valid ticket",
    invalidBody: "The QR code doesn't match a registration for the conference.",
    email: "Email",
    phone: "Phone",
    organisation: "Organisation",
    jobTitle: "Job title",
    name: "Name",
    category: "Category",
    save: "Save contact",
    write: "Send an email",
  },
  fr: {
    shared: "Coordonnées",
    sharedNote: "Partagées avec l'accord de ce participant.",
    notShared: "Coordonnées non partagées",
    notSharedBody: "Ce participant a choisi de ne pas partager ses coordonnées.",
    invalid: "Ce billet n'est pas valide",
    invalidBody: "Ce QR code ne correspond à aucune inscription à la conférence.",
    email: "E-mail",
    phone: "Téléphone",
    organisation: "Organisation",
    jobTitle: "Poste",
    name: "Nom",
    category: "Catégorie",
    save: "Enregistrer le contact",
    write: "Envoyer un e-mail",
  },
};

export default async function ContactPage(props: PageProps<"/p/[code]">) {
  const [{ code }, lang] = await Promise.all([props.params, legalLanguage(props.searchParams)]);
  const t = COPY[lang];

  const result = await getPublicContact(code);
  const attendee = result.status === "shared" ? result.contact : null;

  return (
    <main id="main" lang={lang} className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <SiteLanguageSync lang={lang} />
      <div className="mx-auto max-w-md">
        {result.status === "invalid" ? (
          <Notice icon={<IconAlert className="h-7 w-7 text-danger" />} eyebrow={EVENT_INFO.name[lang]} title={t.invalid} body={t.invalidBody} />
        ) : result.status === "private" ? (
          <Card className="space-y-4 p-6 sm:p-8">
            <IconUser className="h-7 w-7 text-ink-3" />
            <Eyebrow>{EVENT_INFO.name[lang]}</Eyebrow>
            <h1 className="font-display text-3xl font-extrabold wrap-break-word text-blue">{result.contact.full_name}</h1>
            {result.contact.job_title && <p className="font-medium text-ink">{result.contact.job_title}</p>}
            {result.contact.organization && <p className="text-ink-2">{result.contact.organization}</p>}
            <p className="border-t border-line pt-4 text-sm text-ink-3">{t.notSharedBody}</p>
          </Card>
        ) : (
          <Card className="space-y-5 p-6 sm:p-8">
            <div className="space-y-2">
              <Eyebrow>{EVENT_INFO.name[lang]}</Eyebrow>
              <RolePill role={attendee!.role} />
              <h1 className="font-display text-3xl font-extrabold wrap-break-word text-blue">{attendee!.full_name}</h1>
              {(attendee!.job_title || attendee!.organization) && (
                <p className="text-ink-2">{[attendee!.job_title, attendee!.organization].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <dl className="divide-y divide-line border-y border-line">
              <Row label={t.name} value={attendee!.full_name} />
              <Row label={t.category} value={roleLabel(attendee!.role)} />
              <Row label={t.email} value={<a className={linkClass} href={`mailto:${attendee!.email}`}>{attendee!.email}</a>} />
              {attendee!.phone && <Row label={t.phone} value={<a className={linkClass} href={`tel:${attendee!.phone.replace(/\s/g, "")}`}>{attendee!.phone}</a>} />}
              {attendee!.organization && <Row label={t.organisation} value={attendee!.organization} />}
              {attendee!.job_title && <Row label={t.jobTitle} value={attendee!.job_title} />}
            </dl>
            <div className="flex flex-wrap gap-2">
              <ButtonAnchor href={`/p/${code}/vcard`} variant="primary" className="flex-1">
                {t.save}
              </ButtonAnchor>
              <ButtonAnchor href={`mailto:${attendee!.email}`} variant="outline" className="flex-1">
                {t.write}
              </ButtonAnchor>
            </div>
            <p className="text-sm text-ink-3">{t.sharedNote}</p>
          </Card>
        )}
      </div>
    </main>
  );
}

function Notice({ icon, eyebrow, title, body }: { icon: ReactNode; eyebrow: string; title: string; body: string }) {
  return (
    <Card className="space-y-3 p-6 text-center sm:p-8">
      <div className="flex justify-center">{icon}</div>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="font-display text-2xl font-extrabold text-blue">{title}</h1>
      <p className="text-ink-2">{body}</p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="text-base text-ink [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
