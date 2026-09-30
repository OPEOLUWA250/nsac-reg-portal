import type { Metadata } from "next";
import LegalPage, { LegalSection, legalLanguage } from "@/components/LegalPage";
import { linkClass } from "@/components/ui";
import { COPY } from "@/lib/registration-copy";
import { SPACE_IN_AFRICA_PRIVACY_URL } from "@/lib/registration-config";

const email = COPY.en.helpEmail;

const META = {
  en: {
    title: "Privacy",
    description: "What the NewSpace Africa Conference 2027 registration site collects, why, and who it is shared with.",
  },
  fr: {
    title: "Confidentialité",
    description:
      "Les données recueillies par le site d'inscription à la Conférence NewSpace Africa 2027, pourquoi, et avec qui elles sont partagées.",
  },
};

export async function generateMetadata(props: PageProps<"/privacy">): Promise<Metadata> {
  return META[await legalLanguage(props.searchParams)];
}

export default async function PrivacyPage(props: PageProps<"/privacy">) {
  const lang = await legalLanguage(props.searchParams);
  return lang === "fr" ? <PrivacyFr /> : <PrivacyEn />;
}

function MailLink() {
  return (
    <a className={linkClass} href={`mailto:${email}`}>
      {email}
    </a>
  );
}

function PrivacyEn() {
  return (
    <LegalPage
      lang="en"
      path="/privacy"
      title="Privacy"
      intro={
        <p>
          This page explains what this registration site collects and why. Space in Africa organises the conference and
          is responsible for your data. The{" "}
          <a className={linkClass} href={SPACE_IN_AFRICA_PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            Space in Africa privacy policy
          </a>{" "}
          covers everything else.
        </p>
      }
    >
      <LegalSection title="What we collect">
        <ul>
          <li>Your registration category (delegate, speaker, media, exhibitor or VIP), name, email address, phone number and job title.</li>
          <li>Your nationality, country of residence, organisation, its country, your professional category and job function.</li>
          <li>Whether you need an invitation letter and, if you upload it, a copy of your passport.</li>
          <li>Food allergies, so the catering can plan for them.</li>
          <li>Your ticket, the amount paid, and a VAT number or invoice ID if you give one.</li>
          <li>Your answers to the consent, communication and sharing questions, and the time you gave them.</li>
          <li>A promo code, if you used one.</li>
          <li>On the day: when and where you checked in, and how many badges were printed for you.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Why we use it">
        <ul>
          <li>To register you, take payment, send your ticket and check you in at the event.</li>
          <li>To prepare an invitation letter for your visa, if you asked for one. Your passport is used for nothing else.</li>
          <li>To plan the event, for example catering and attendance numbers.</li>
          <li>To send you news about the conference, or share your details with sponsors and exhibitors, only if you ticked those boxes.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Who else handles it">
        <p>We use a few services to run registration. Each one only gets what it needs:</p>
        <ul>
          <li>Stripe takes your card payment. We never see or store your card details.</li>
          <li>Supabase stores the registrations and passport uploads. Passports are kept private and staff open them through links that expire after five minutes.</li>
          <li>Our email provider sends your ticket and confirmation.</li>
          <li>Cloudflare Turnstile checks that the form is sent by a person, not a bot.</li>
        </ul>
      </LegalSection>

      <LegalSection title="When someone scans your QR code">
        <p>
          Your QR code opens a contact page when it&apos;s scanned with a phone. If you answered yes to &quot;Can your
          details be shared?&quot;, that page shows your name, category, job title, organisation, nationality, email
          and phone number, so people you meet (for example exhibitors) can contact you. If you answered no, it only
          says you chose not to share. Event staff checking you in always see your registration.
        </p>
        <p>
          To change your answer, write to <MailLink />.
        </p>
      </LegalSection>

      <LegalSection title="What stays on your device">
        <ul>
          <li>Your language choice, so the form opens in the same language next time.</li>
          <li>Your answers while you fill in the form, so you can close the page and carry on later. They are deleted once you have paid, when you press Start over, or after 14 days. Passport files are never kept this way.</li>
          <li>The photo you use in the flyer maker. It is never uploaded.</li>
        </ul>
        <p>This site doesn&apos;t use advertising or tracking cookies.</p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>
          To see, correct or delete your details, or to stop receiving messages, write to <MailLink />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

function PrivacyFr() {
  return (
    <LegalPage
      lang="fr"
      path="/privacy"
      title="Confidentialité"
      intro={
        <p>
          Cette page explique quelles données ce site d&apos;inscription recueille et pourquoi. Space in Africa organise la
          conférence et est responsable de vos données. La{" "}
          <a className={linkClass} href={SPACE_IN_AFRICA_PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            politique de confidentialité de Space in Africa
          </a>{" "}
          couvre tout le reste.
        </p>
      }
    >
      <LegalSection title="Ce que nous recueillons">
        <ul>
          <li>Votre catégorie d&apos;inscription (délégué, intervenant, médias, exposant ou VIP), vos nom et prénom, votre adresse e-mail, votre numéro de téléphone et l&apos;intitulé de votre poste.</li>
          <li>Votre nationalité, votre pays de résidence, votre organisation et son pays, votre catégorie professionnelle et le domaine d&apos;activité de votre poste.</li>
          <li>Si vous avez besoin d&apos;une lettre d&apos;invitation et, si vous la joignez, une copie de votre passeport.</li>
          <li>Vos allergies alimentaires, pour que le traiteur puisse en tenir compte.</li>
          <li>Votre billet, le montant payé et, si vous les indiquez, un numéro de TVA ou une référence de facture.</li>
          <li>Vos réponses aux questions de consentement, de communication et de partage, avec leur date.</li>
          <li>Un code promo, si vous en avez utilisé un.</li>
          <li>Le jour de l&apos;événement&nbsp;: l&apos;heure et le lieu de votre enregistrement, et le nombre de badges imprimés à votre nom.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Pourquoi nous les utilisons">
        <ul>
          <li>Pour vous inscrire, encaisser votre paiement, vous envoyer votre billet et enregistrer votre arrivée à l&apos;événement.</li>
          <li>Pour établir une lettre d&apos;invitation pour votre visa, si vous en avez demandé une. Votre passeport ne sert à rien d&apos;autre.</li>
          <li>Pour organiser l&apos;événement, par exemple la restauration et le nombre de participants.</li>
          <li>Pour vous envoyer des nouvelles de la conférence, ou transmettre vos coordonnées aux sponsors et exposants, uniquement si vous avez coché les cases correspondantes.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Qui d'autre y a accès">
        <p>Nous faisons appel à quelques services pour gérer les inscriptions. Chacun ne reçoit que ce dont il a besoin&nbsp;:</p>
        <ul>
          <li>Stripe traite votre paiement par carte. Nous ne voyons ni ne conservons jamais vos données bancaires.</li>
          <li>Supabase héberge les inscriptions et les passeports joints. Les passeports restent privés et l&apos;équipe les consulte par des liens qui expirent au bout de cinq minutes.</li>
          <li>Notre service d&apos;e-mail envoie votre billet et votre confirmation.</li>
          <li>Cloudflare Turnstile vérifie que le formulaire est envoyé par une personne et non par un robot.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Quand quelqu'un scanne votre QR code">
        <p>
          Scanné avec un téléphone, votre QR code ouvre une page de contact. Si vous avez répondu oui à «&nbsp;Vos
          coordonnées peuvent-elles être partagées&nbsp;?&nbsp;», cette page affiche vos nom et prénom, votre catégorie,
          votre poste, votre organisation, votre nationalité, votre e-mail et votre numéro de téléphone, pour que les
          personnes rencontrées (par exemple les exposants) puissent vous contacter. Si vous avez répondu non, elle
          indique seulement que vous avez choisi de ne pas les partager. L&apos;équipe qui enregistre votre arrivée voit
          toujours votre inscription.
        </p>
        <p>
          Pour modifier votre réponse, écrivez à <MailLink />.
        </p>
      </LegalSection>

      <LegalSection title="Ce qui reste sur votre appareil">
        <ul>
          <li>Votre choix de langue, pour que le formulaire s&apos;ouvre dans la même langue la prochaine fois.</li>
          <li>Vos réponses pendant que vous remplissez le formulaire, pour que vous puissiez fermer la page et reprendre plus tard. Elles sont effacées une fois le paiement effectué, si vous cliquez sur Recommencer, ou au bout de 14 jours. Les passeports ne sont jamais conservés de cette façon.</li>
          <li>La photo utilisée dans l&apos;outil de création de visuel. Elle n&apos;est jamais envoyée.</li>
        </ul>
        <p>Ce site n&apos;utilise pas de cookies publicitaires ni de cookies de suivi.</p>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Pour consulter, corriger ou supprimer vos données, ou pour ne plus recevoir de messages, écrivez à <MailLink />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
