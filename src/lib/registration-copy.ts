import type { FieldError, JobFunction, Language, ProfessionalCategory } from "@/lib/registration-fields";

// All text shown on the registration pages, in English and French.

type Copy = {
  kicker: string;
  title: string;
  intro: string;
  helpEmail: string;
  cancelled: string;
  resumed: { title: string; body: string; startOver: string };
  closedTitle: string;
  closedBody: string;
  sections: { you: string; organization: string; travel: string; ticket: string; agreements: string };
  optional: string;
  fields: {
    firstName: string;
    lastName: string;
    email: string;
    emailHint: string;
    jobTitle: string;
    phone: string;
    phoneHint: string;
    nationality: string;
    residenceCountry: string;
    residenceHint: string;
    organization: string;
    organizationCountry: string;
    professionalCategory: string;
    jobFunction: string;
    invitationLetter: string;
    passport: string;
    passportHint: string;
    passportChoose: string;
    passportRemove: string;
    foodAllergies: string;
    foodAllergiesHint: string;
    ticket: string;
    couponHint: string;
    vatNumber: string;
    vatHint: string;
    vatRequiredHint: string;
    invoiceId: string;
    safetyConsent: (privacyLink: string) => string;
    optInOrganizer: string;
    optInSponsors: string;
  };
  selectPlaceholder: string;
  noCountry: (query: string) => string;
  yes: string;
  no: string;
  professionalCategories: Record<ProfessionalCategory, string>;
  jobFunctions: Record<JobFunction, string>;
  errors: Record<FieldError, string> & {
    summary: string;
    network: string;
    server: string;
    spam: string;
    closed: string;
    payment: string;
    passportUpload: string;
  };
  steps: readonly [string, string, string];
  stepOf: (n: number, total: number) => string;
  next: string;
  back: string;
  review: {
    title: string;
    name: string;
    email: string;
    organization: string;
    total: string;
    noTicket: string;
    edit: string;
    empty: string;
  };
  submit: (price: string) => string;
  submitting: string;
  uploading: (pct: number) => string;
  redirecting: string;
  alreadyRegistered: { title: string; body: string };
  passportSkipped: string;
  securePayment: string;
  success: {
    title: string;
    paidBody: (first: string) => string;
    qrHelp: string;
    download: string;
    ticketAlt: string;
    emailNote: string;
    emailPending: string;
    addToCalendar: string;
    flyerTitle: string;
    flyerBody: string;
    flyerCta: string;
    processingTitle: string;
    processingBody: string;
    checkAgain: string;
    notFoundTitle: string;
    notFoundBody: string;
    backToForm: string;
  };
};

export const COPY: Record<Language, Copy> = {
  en: {
    kicker: "NewSpace Africa Conference 2027",
    title: "Registration",
    intro:
      "Three short steps. You pay by card at the end, and your QR ticket arrives by email. Questions? Write to",
    helpEmail: "info@spaceinafrica.com",
    resumed: {
      title: "Welcome back",
      body: "We kept your answers, so you can carry on where you left off.",
      startOver: "Start over",
    },
    closedTitle: "Registration is closed",
    closedBody: "The form isn't taking registrations at the moment. For questions, write to",
    cancelled: "Payment was cancelled. You weren't charged, and your answers are still here. Submit the form again whenever you're ready.",
    sections: {
      you: "About you",
      organization: "Your organisation",
      travel: "Travel and logistics",
      ticket: "Ticket",
      agreements: "Agreements",
    },
    optional: "optional",
    fields: {
      firstName: "First name",
      lastName: "Last name",
      email: "Email",
      emailHint: "Your QR ticket will be sent here.",
      jobTitle: "Job title",
      phone: "Phone number",
      phoneHint: "Include your country code, e.g. +221 …",
      nationality: "Nationality",
      residenceCountry: "Country of residence",
      residenceHint: "Where you will be applying for a visa, if you need one.",
      organization: "Company / Institution / Organisation",
      organizationCountry: "Company / Institution / Organisation location",
      professionalCategory: "Professional category",
      jobFunction: "Category of your job function",
      invitationLetter: "Do you require an invitation letter?",
      passport: "Upload your passport",
      passportHint:
        "Every delegate requires an invitation letter to enter Senegal. Your passport will enable us to process such a letter. Photo or PDF, up to 10 MB.",
      passportChoose: "Choose file",
      passportRemove: "Remove",
      foodAllergies: "Any food allergies?",
      foodAllergiesHint: "Write “None” if you have none.",
      ticket: "Choose your ticket",
      couponHint: "Have a discount code? You can enter it on the payment page.",
      vatNumber: "Company VAT number",
      vatHint: "This is compulsory if you are registering from Europe.",
      vatRequiredHint: "Required for organisations located in Europe.",
      invoiceId: "Invoice ID",
      safetyConsent: (privacyLink) =>
        `By submitting this registration form, I agree to the conference safety guideline and to Space in Africa processing my details (including my passport, if uploaded) as described in the ${privacyLink}.`,
      optInOrganizer: "I agree to receive further communications from the event organisers",
      optInSponsors: "I agree to receive communications from event sponsors and exhibitors",
    },
    selectPlaceholder: "Type or choose a country",
    noCountry: (q) => `No country matches “${q}”. Check the spelling, or try its name in English.`,
    yes: "Yes",
    no: "No",
    professionalCategories: {
      government: "Government Official",
      industry: "Industry Professional",
      academia: "Academia / Research",
      student: "Student",
      media: "Media",
      other: "Others",
    },
    jobFunctions: {
      executive: "C-level / Executive / Senior Management",
      engineering: "Engineering",
      rnd: "R&D / Product Development",
      business_development: "Business Development / Sales",
      procurement: "Procurement / Purchasing",
      legal_policy: "Legal / Policy",
      other: "Other",
    },
    errors: {
      required: "This field is required.",
      too_long: "This is too long.",
      invalid_email: "Enter a valid email address.",
      invalid_phone: "Enter a valid phone number, with country code.",
      invalid_choice: "Please choose an option from the list.",
      consent_required: "You need to agree to continue.",
      file_type: "Upload a photo (JPG, PNG, WebP) or a PDF.",
      file_too_large: "The file must be 10 MB or smaller.",
      ticket_unavailable: "This ticket is no longer available. Please choose another.",
      vat_required: "A VAT number is required for organisations located in Europe.",
      summary: "Please check the highlighted fields.",
      network:
        "We couldn't reach the server. Check your connection and try again. Your answers are still here.",
      server: "Something went wrong on our side. Please try again in a moment.",
      spam: "The security check failed. Please try again.",
      closed: "Registration is currently closed.",
      payment: "The payment service is unavailable right now. Please try again in a few minutes.",
      passportUpload:
        "Your passport couldn't be uploaded. You can continue to payment; we'll email you to collect it.",
    },
    steps: ["About you", "Organisation & travel", "Ticket & payment"],
    stepOf: (n, total) => `Step ${n} of ${total}`,
    next: "Continue",
    back: "Back",
    review: {
      title: "Review your registration",
      name: "Name",
      email: "Email",
      organization: "Role",
      total: "Total",
      noTicket: "Choose a ticket above",
      edit: "Edit",
      empty: "Not given",
    },
    submit: (price) => `Continue to payment · ${price}`,
    submitting: "Saving your registration…",
    uploading: (pct) => `Uploading your passport… ${pct}%`,
    redirecting: "Taking you to the secure payment page…",
    alreadyRegistered: {
      title: "You're already registered",
      body: "This email address already has a ticket. We've sent your QR code to it again. Check your inbox and spam folder.",
    },
    passportSkipped:
      "We couldn't attach a passport to an existing registration. Our team will email you to collect it.",
    securePayment: "Payments are processed securely by Stripe. We never see your card details.",
    success: {
      title: "You're registered!",
      paidBody: (first) =>
        `Thank you${first ? `, ${first}` : ""}. Your payment was received and your place at the NewSpace Africa Conference 2027 is confirmed.`,
      qrHelp:
        "This is your ticket. Show its QR code (on your phone or printed) at the registration desk to collect your badge.",
      download: "Download ticket",
      ticketAlt: "Your NewSpace Africa Conference 2027 ticket with check-in QR code",
      emailNote: "We've also emailed it to you. Stripe sends your receipt separately.",
      emailPending:
        "We couldn't email your ticket just yet, so please download it now. We'll try the email again shortly.",
      addToCalendar: "Add to your calendar",
      flyerTitle: "Tell your network you're coming",
      flyerBody: "Make an “I'm attending” graphic with your photo for LinkedIn, Instagram or WhatsApp. It takes a minute.",
      flyerCta: "Create my flyer",
      processingTitle: "Payment processing",
      processingBody:
        "Your payment is still being processed. As soon as it's confirmed, we'll email your QR ticket. You can close this page.",
      checkAgain: "Check again",
      notFoundTitle: "We couldn't find this payment",
      notFoundBody: "If you completed a payment, check your email for your QR ticket, or contact",
      backToForm: "Back to registration",
    },
  },
  fr: {
    kicker: "Conférence NewSpace Africa 2027",
    title: "Inscription",
    intro:
      "Trois étapes rapides. Vous payez par carte à la fin et votre billet avec QR code arrive par e-mail. Une question\u00a0? Écrivez à",
    helpEmail: "info@spaceinafrica.com",
    resumed: {
      title: "Bon retour parmi nous",
      body: "Nous avons gardé vos réponses\u00a0: vous pouvez reprendre là où vous vous étiez arrêté(e).",
      startOver: "Recommencer",
    },
    closedTitle: "Les inscriptions sont fermées",
    closedBody: "Le formulaire n'accepte pas d'inscriptions pour le moment. Pour toute question, écrivez à",
    cancelled:
      "Le paiement a été annulé. Aucun montant n'a été débité et vos réponses sont conservées. Renvoyez le formulaire quand vous le souhaitez.",
    sections: {
      you: "Vos informations",
      organization: "Votre organisation",
      travel: "Voyage et logistique",
      ticket: "Billet",
      agreements: "Consentements",
    },
    optional: "facultatif",
    fields: {
      firstName: "Prénom",
      lastName: "Nom",
      email: "E-mail",
      emailHint: "Votre billet avec QR code sera envoyé à cette adresse.",
      jobTitle: "Intitulé du poste",
      phone: "Numéro de téléphone",
      phoneHint: "Avec l'indicatif du pays, par ex. +221 …",
      nationality: "Nationalité",
      residenceCountry: "Pays de résidence",
      residenceHint: "Le pays où vous demanderez votre visa, le cas échéant.",
      organization: "Entreprise / Institution / Organisation",
      organizationCountry: "Pays de l'entreprise / institution / organisation",
      professionalCategory: "Catégorie professionnelle",
      jobFunction: "Domaine d'activité de votre poste",
      invitationLetter: "Avez-vous besoin d'une lettre d'invitation\u00a0?",
      passport: "Joignez votre passeport",
      passportHint:
        "Chaque délégué(e) a besoin d'une lettre d'invitation pour entrer au Sénégal. Votre passeport nous permet de l'établir. Photo ou PDF, 10\u00a0Mo maximum.",
      passportChoose: "Choisir un fichier",
      passportRemove: "Retirer",
      foodAllergies: "Avez-vous des allergies alimentaires\u00a0?",
      foodAllergiesHint: "Écrivez «\u00a0Aucune\u00a0» si vous n'en avez pas.",
      ticket: "Choisissez votre billet",
      couponHint: "Vous avez un code de réduction\u00a0? Saisissez-le sur la page de paiement.",
      vatNumber: "Numéro de TVA intracommunautaire de l'entreprise",
      vatHint: "Obligatoire pour les organisations situées en Europe.",
      vatRequiredHint: "Obligatoire pour les organisations situées en Europe.",
      invoiceId: "Référence de facture",
      safetyConsent: (privacyLink) =>
        `En envoyant ce formulaire, j'accepte les consignes de sécurité de la conférence et le traitement de mes données par Space in Africa (y compris mon passeport, le cas échéant) conformément à la ${privacyLink}.`,
      optInOrganizer: "J'accepte de recevoir d'autres communications de la part des organisateurs",
      optInSponsors: "J'accepte de recevoir des communications de la part des sponsors et des exposants",
    },
    selectPlaceholder: "Tapez ou choisissez un pays",
    noCountry: (q) => `Aucun pays ne correspond à «\u00a0${q}\u00a0». Vérifiez l'orthographe.`,
    yes: "Oui",
    no: "Non",
    professionalCategories: {
      government: "Représentant(e) du gouvernement",
      industry: "Professionnel(le) de l'industrie",
      academia: "Monde universitaire / Recherche",
      student: "Étudiant(e)",
      media: "Médias",
      other: "Autre",
    },
    jobFunctions: {
      executive: "Direction générale / Cadre dirigeant",
      engineering: "Ingénierie",
      rnd: "R&D / Développement de produits",
      business_development: "Développement commercial / Ventes",
      procurement: "Achats / Approvisionnement",
      legal_policy: "Juridique / Politiques publiques",
      other: "Autre",
    },
    errors: {
      required: "Ce champ est obligatoire.",
      too_long: "Ce texte est trop long.",
      invalid_email: "Saisissez une adresse e-mail valide.",
      invalid_phone: "Saisissez un numéro valide, avec l'indicatif du pays.",
      invalid_choice: "Veuillez choisir une option dans la liste.",
      consent_required: "Vous devez accepter pour continuer.",
      file_type: "Joignez une photo (JPG, PNG, WebP) ou un PDF.",
      file_too_large: "Le fichier ne doit pas dépasser 10\u00a0Mo.",
      ticket_unavailable: "Ce billet n'est plus disponible. Veuillez en choisir un autre.",
      vat_required: "Un numéro de TVA est obligatoire pour les organisations situées en Europe.",
      summary: "Veuillez vérifier les champs signalés.",
      network:
        "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez. Vos réponses sont conservées.",
      server: "Une erreur s'est produite de notre côté. Veuillez réessayer dans un instant.",
      spam: "La vérification de sécurité a échoué. Veuillez réessayer.",
      closed: "Les inscriptions sont actuellement fermées.",
      payment: "Le service de paiement est indisponible. Veuillez réessayer dans quelques minutes.",
      passportUpload:
        "Votre passeport n'a pas pu être envoyé. Vous pouvez passer au paiement\u00a0; nous vous contacterons par e-mail pour le récupérer.",
    },
    steps: ["Vos informations", "Organisation et voyage", "Billet et paiement"],
    stepOf: (n, total) => `Étape ${n} sur ${total}`,
    next: "Continuer",
    back: "Retour",
    review: {
      title: "Vérifiez votre inscription",
      name: "Nom",
      email: "E-mail",
      organization: "Poste",
      total: "Total",
      noTicket: "Choisissez un billet ci-dessus",
      edit: "Modifier",
      empty: "Non renseigné",
    },
    submit: (price) => `Passer au paiement · ${price}`,
    submitting: "Enregistrement de votre inscription…",
    uploading: (pct) => `Envoi de votre passeport… ${pct}\u00a0%`,
    redirecting: "Redirection vers la page de paiement sécurisée…",
    alreadyRegistered: {
      title: "Vous êtes déjà inscrit(e)",
      body: "Cette adresse e-mail a déjà un billet. Nous vous avons renvoyé votre QR code. Vérifiez votre boîte de réception et vos spams.",
    },
    passportSkipped:
      "Nous n'avons pas pu joindre un passeport à une inscription existante. Notre équipe vous contactera par e-mail.",
    securePayment: "Les paiements sont traités de façon sécurisée par Stripe. Nous ne voyons jamais vos données bancaires.",
    success: {
      title: "Votre inscription est confirmée\u00a0!",
      paidBody: (first) =>
        `Merci${first ? ` ${first}` : ""}. Votre paiement a été reçu et votre place à la Conférence NewSpace Africa 2027 est confirmée.`,
      qrHelp:
        "Voici votre billet. Présentez son QR code (sur votre téléphone ou imprimé) à l'accueil pour récupérer votre badge.",
      download: "Télécharger le billet",
      ticketAlt: "Votre billet pour la Conférence NewSpace Africa 2027 avec QR code d'accès",
      emailNote: "Nous vous l'avons aussi envoyé par e-mail. Stripe vous envoie votre reçu séparément.",
      emailPending:
        "Nous n'avons pas encore pu vous envoyer votre billet par e-mail\u00a0: téléchargez-le dès maintenant. Nous réessaierons sous peu.",
      addToCalendar: "Ajouter à votre agenda",
      flyerTitle: "Annoncez votre participation",
      flyerBody: "Créez un visuel «\u00a0J'y serai\u00a0» avec votre photo pour LinkedIn, Instagram ou WhatsApp. Cela prend une minute.",
      flyerCta: "Créer mon visuel",
      processingTitle: "Paiement en cours",
      processingBody:
        "Votre paiement est en cours de traitement. Dès sa confirmation, nous vous enverrons votre billet par e-mail. Vous pouvez fermer cette page.",
      checkAgain: "Vérifier à nouveau",
      notFoundTitle: "Paiement introuvable",
      notFoundBody: "Si vous avez effectué un paiement, vérifiez vos e-mails ou contactez",
      backToForm: "Retour à l'inscription",
    },
  },
};
