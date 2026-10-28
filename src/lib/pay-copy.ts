// Words on /pay/<link>, the page a payment reminder's button opens.
// English and French side by side (see DESIGN.md, Copy).

export const PAY_COPY = {
  en: {
    title: "Complete your registration",
    greeting: (first: string) => `Dear ${first}, your details are saved. Pay for your ticket to confirm your place.`,
    chooseIntro: (ticket: string) =>
      ticket
        ? `The ${ticket} ticket you chose is no longer on sale. Choose a ticket below, at today's price.`
        : "Choose a ticket below, at today's price.",
    ticket: "Ticket",
    toPay: "To pay",
    codeApplied: (code: string) => `Your code ${code} is applied.`,
    codeDropped: (code: string) => `Your code ${code} has ended, so this is the full price.`,
    pay: "Continue to payment",
    redirecting: "Opening the payment page",
    secure: "You pay by card on Stripe's secure page. Your confirmation and entry QR code arrive by email straight after.",
    chooseFirst: "Choose a ticket to continue.",
    failed: "The payment page didn't open. Try again in a moment.",
    paidTitle: "You're already registered",
    paidBody: (email: string) => `Your payment has gone through. Your confirmation and entry QR code were emailed to ${email}.`,
    closedTitle: "Registration is closed",
    closedBody: "Registration for the conference has closed, so this payment link no longer works. For help, write to",
    invalidTitle: "This link doesn't work",
    invalidBody: "Check that you opened the whole link from your email. For help, write to",
    backHome: "Go to the registration page",
  },
  fr: {
    title: "Finalisez votre inscription",
    greeting: (first: string) => `Bonjour ${first}, vos informations sont enregistrées. Réglez votre billet pour confirmer votre place.`,
    chooseIntro: (ticket: string) =>
      ticket
        ? `Le billet ${ticket} que vous aviez choisi n'est plus en vente. Choisissez un billet ci-dessous, au tarif actuel.`
        : "Choisissez un billet ci-dessous, au tarif actuel.",
    ticket: "Billet",
    toPay: "À payer",
    codeApplied: (code: string) => `Votre code ${code} est appliqué.`,
    codeDropped: (code: string) => `Votre code ${code} n'est plus valable : il s'agit du plein tarif.`,
    pay: "Continuer vers le paiement",
    redirecting: "Ouverture de la page de paiement",
    secure: "Vous payez par carte sur la page sécurisée de Stripe. Votre confirmation et votre QR code d'accès arrivent par e-mail juste après.",
    chooseFirst: "Choisissez un billet pour continuer.",
    failed: "La page de paiement ne s'est pas ouverte. Réessayez dans un instant.",
    paidTitle: "Vous êtes déjà inscrit(e)",
    paidBody: (email: string) => `Votre paiement a bien été reçu. Votre confirmation et votre QR code d'accès ont été envoyés à ${email}.`,
    closedTitle: "Les inscriptions sont fermées",
    closedBody: "Les inscriptions à la conférence sont fermées : ce lien de paiement ne fonctionne plus. Pour toute aide, écrivez à",
    invalidTitle: "Ce lien ne fonctionne pas",
    invalidBody: "Vérifiez que vous avez ouvert le lien complet de votre e-mail. Pour toute aide, écrivez à",
    backHome: "Aller à la page d'inscription",
  },
} as const;

export type PayCopy = (typeof PAY_COPY)["en"] | (typeof PAY_COPY)["fr"];
