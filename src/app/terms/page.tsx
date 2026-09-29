import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { LegalSection, legalLanguage } from "@/components/LegalPage";
import { linkClass } from "@/components/ui";
import { COPY } from "@/lib/registration-copy";
import { EVENT_INFO } from "@/lib/event-info";

const email = COPY.en.helpEmail;

const META = {
  en: {
    title: "Terms",
    description: "The terms for registering and buying a ticket for the NewSpace Africa Conference 2027.",
  },
  fr: {
    title: "Conditions",
    description: "Les conditions d'inscription et d'achat de billet pour la Conférence NewSpace Africa 2027.",
  },
};

export async function generateMetadata(props: PageProps<"/terms">): Promise<Metadata> {
  return META[await legalLanguage(props.searchParams)];
}

export default async function TermsPage(props: PageProps<"/terms">) {
  const lang = await legalLanguage(props.searchParams);
  return lang === "fr" ? <TermsFr /> : <TermsEn />;
}

function MailLink() {
  return (
    <a className={linkClass} href={`mailto:${email}`}>
      {email}
    </a>
  );
}

function TermsEn() {
  return (
    <LegalPage
      lang="en"
      path="/terms"
      title="Terms of registration"
      intro={
        <p>
          These terms apply when you register for the {EVENT_INFO.name.en}, {EVENT_INFO.date.en} in {EVENT_INFO.place.en},
          organised by Space in Africa. By sending the registration form you accept them.
        </p>
      }
    >
      <LegalSection title="Your registration">
        <ul>
          <li>Each registration is for one named person. Give your own, accurate details.</li>
          <li>Your place is confirmed once your payment has gone through. We then email your ticket with its QR code.</li>
          <li>One ticket per email address. If you register again with the same address, we send your existing ticket.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Prices and payment">
        <ul>
          <li>Prices are shown on the form in euros. You pay the price shown when you register.</li>
          <li>Payment is taken by card through Stripe. Discount codes are entered on the Stripe payment page.</li>
          <li>Organisations based in Europe must give a company VAT number.</li>
          <li>Stripe emails your receipt. If you need an invoice, write to us.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Changes and cancellations">
        <p>
          To change the name on a ticket, correct your details or ask about cancelling, write to <MailLink /> with your
          ticket reference.
        </p>
      </LegalSection>

      <LegalSection title="At the event">
        <ul>
          <li>Bring your QR code, on your phone or printed. It is scanned at the registration desk and your badge is printed there.</li>
          <li>Your QR code is personal and identifies you at check-in. Don&apos;t share it.</li>
          <li>You agree to follow the conference safety guidelines and the instructions of the event staff.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Invitation letters">
        <p>
          If you ask for an invitation letter, we prepare it from the passport you upload. The letter supports your visa
          application but doesn&apos;t guarantee that a visa will be granted.
        </p>
      </LegalSection>

      <LegalSection title="Your data">
        <p>
          How we use your details is explained on the{" "}
          <Link className={linkClass} href="/privacy?lang=en">
            privacy page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}

function TermsFr() {
  return (
    <LegalPage
      lang="fr"
      path="/terms"
      title="Conditions d'inscription"
      intro={
        <p>
          Ces conditions s&apos;appliquent à votre inscription à la {EVENT_INFO.name.fr}, {EVENT_INFO.dateInSentence.fr} à{" "}
          {EVENT_INFO.place.fr}, organisée par Space in Africa. En envoyant le formulaire d&apos;inscription, vous les
          acceptez.
        </p>
      }
    >
      <LegalSection title="Votre inscription">
        <ul>
          <li>Chaque inscription concerne une seule personne, nommément désignée. Indiquez vos propres coordonnées, exactes.</li>
          <li>Votre place est confirmée dès que votre paiement a été accepté. Nous vous envoyons alors par e-mail votre billet avec son QR code.</li>
          <li>Un billet par adresse e-mail. Si vous vous inscrivez à nouveau avec la même adresse, nous vous renvoyons votre billet.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Prix et paiement">
        <ul>
          <li>Les prix sont indiqués en euros sur le formulaire. Vous payez le prix affiché au moment de votre inscription.</li>
          <li>Le paiement se fait par carte, via Stripe. Les codes de réduction se saisissent sur la page de paiement Stripe.</li>
          <li>Les organisations situées en Europe doivent indiquer leur numéro de TVA intracommunautaire.</li>
          <li>Stripe vous envoie votre reçu par e-mail. Si vous avez besoin d&apos;une facture, écrivez-nous.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Modifications et annulations">
        <p>
          Pour changer le nom figurant sur un billet, corriger vos informations ou vous renseigner sur une annulation,
          écrivez à <MailLink /> en indiquant la référence de votre billet.
        </p>
      </LegalSection>

      <LegalSection title="Pendant l'événement">
        <ul>
          <li>Apportez votre QR code, sur votre téléphone ou imprimé. Il est scanné à l&apos;accueil, où votre badge est imprimé.</li>
          <li>Votre QR code est personnel et vous identifie à l&apos;accueil. Ne le partagez pas.</li>
          <li>Vous vous engagez à respecter les consignes de sécurité de la conférence et les indications de l&apos;équipe organisatrice.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Lettres d'invitation">
        <p>
          Si vous demandez une lettre d&apos;invitation, nous l&apos;établissons à partir du passeport que vous avez joint.
          Cette lettre appuie votre demande de visa, mais ne garantit pas son obtention.
        </p>
      </LegalSection>

      <LegalSection title="Vos données">
        <p>
          L&apos;utilisation de vos données est expliquée sur la page{" "}
          <Link className={linkClass} href="/privacy?lang=fr">
            Confidentialité
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
