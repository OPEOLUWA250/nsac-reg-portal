import { EVENT_INFO } from "@/lib/event-info";
import type { Language } from "@/lib/registration-fields";

// Text for the "I'm attending" flyer maker (/flyer), in English and French.

export const HEADLINES = ["attending", "speaking", "join"] as const;
export type Headline = (typeof HEADLINES)[number];

export const FLYER_COPY = {
  en: {
    kicker: "Share the news",
    title: "Create your flyer",
    intro:
      "Add your photo to make an “I’m attending” graphic, sized for LinkedIn and just as good on Instagram and WhatsApp. Your photo stays on your device and is never uploaded.",
    photo: "Your photo",
    photoChoose: "Choose a photo",
    photoChange: "Change photo",
    photoHint: "A clear, front-facing photo works best.",
    adjust: "Adjust photo",
    adjustHint: "Drag the photo to move it. Pinch with two fingers or use the slider to zoom.",
    adjustDone: "Done",
    zoom: "Zoom",
    photoError: "Couldn't read that image. Try a JPG or PNG photo.",
    moveHint: "Use the arrow keys to move your photo, and + or - to zoom.",
    firstName: "First name",
    lastName: "Last name",
    jobTitle: "Job title",
    organization: "Organisation",
    headline: "Headline",
    tagline: "The gathering of Africa's space industry leaders, innovators and partners.",
    dateLabel: "Save the date",
    scanLabel: "Scan to register",
    headlines: {
      attending: "I'm attending",
      speaking: "I'm speaking at",
      join: "Join me at",
    } satisfies Record<Headline, string>,
    caption: "Post text",
    captionHint: "Edit it as you like. It's copied for you when you share.",
    defaultCaption: (headline: Headline) =>
      ({
        attending: `I'm excited to be attending the ${EVENT_INFO.name.en} in ${EVENT_INFO.place.en} ${EVENT_INFO.dateInSentence.en}!\n\nLooking forward to connecting with leaders shaping Africa's space industry. Will I see you there?`,
        speaking: `I'm honoured to be speaking at the ${EVENT_INFO.name.en} in ${EVENT_INFO.place.en} ${EVENT_INFO.dateInSentence.en}!\n\nLooking forward to the conversations on the future of Africa's space industry. Come and join us.`,
        join: `Join me at the ${EVENT_INFO.name.en} in ${EVENT_INFO.place.en} ${EVENT_INFO.dateInSentence.en}!\n\nThe gathering for everyone building Africa's space industry.`,
      })[headline] + `\n\nRegister: ${EVENT_INFO.websiteUrl}\n\n${EVENT_INFO.hashtags}`,
    share: "Share",
    shareLinkedIn: "Share on LinkedIn",
    download: "Download image",
    copyCaption: "Copy post text",
    copied: "Post text copied",
    linkedInSteps:
      "The image has been downloaded and your post text copied. In LinkedIn, add the image to your post (click the photo icon). The text is already filled in.",
    shareFallback: "Your device couldn't share directly, so the image was downloaded instead.",
    rendering: "Preparing…",
    backToTicket: "Back to my ticket",
  },
  fr: {
    kicker: "Faites-le savoir",
    title: "Créez votre visuel",
    intro:
      "Ajoutez votre photo pour créer un visuel «\u00a0J’y serai\u00a0» au format LinkedIn, qui convient aussi à Instagram et WhatsApp. Votre photo reste sur votre appareil et n’est jamais envoyée.",
    photo: "Votre photo",
    photoChoose: "Choisir une photo",
    photoChange: "Changer de photo",
    photoHint: "Une photo nette, de face, donne le meilleur résultat.",
    adjust: "Ajuster la photo",
    adjustHint: "Faites glisser la photo pour la déplacer. Pincez avec deux doigts ou utilisez le curseur pour zoomer.",
    adjustDone: "Terminé",
    zoom: "Zoom",
    photoError: "Impossible de lire cette image. Essayez une photo au format JPG ou PNG.",
    moveHint: "Utilisez les flèches pour déplacer votre photo, et + ou - pour zoomer.",
    firstName: "Prénom",
    lastName: "Nom",
    jobTitle: "Intitulé du poste",
    organization: "Organisation",
    headline: "Accroche",
    tagline: "Le rendez-vous des leaders, innovateurs et partenaires de l'industrie spatiale africaine.",
    dateLabel: "À vos agendas",
    scanLabel: "Scannez pour vous inscrire",
    headlines: {
      attending: "J'y serai",
      speaking: "J'interviens à la",
      join: "Rejoignez-moi à la",
    } satisfies Record<Headline, string>,
    caption: "Texte de la publication",
    captionHint: "Modifiez-le comme vous le souhaitez. Il est copié automatiquement au moment du partage.",
    defaultCaption: (headline: Headline) =>
      ({
        attending: `Ravi(e) de participer à la ${EVENT_INFO.name.fr} à ${EVENT_INFO.place.fr} ${EVENT_INFO.dateInSentence.fr}\u00a0!\n\nHâte d'échanger avec les acteurs qui façonnent l'industrie spatiale africaine. Vous y serez\u00a0?`,
        speaking: `Honoré(e) d'intervenir à la ${EVENT_INFO.name.fr} à ${EVENT_INFO.place.fr} ${EVENT_INFO.dateInSentence.fr}\u00a0!\n\nAu programme\u00a0: l'avenir de l'industrie spatiale africaine. Rejoignez-nous.`,
        join: `Rejoignez-moi à la ${EVENT_INFO.name.fr} à ${EVENT_INFO.place.fr} ${EVENT_INFO.dateInSentence.fr}\u00a0!\n\nLe rendez-vous de tous ceux qui construisent l'industrie spatiale africaine.`,
      })[headline] + `\n\nInscription\u00a0: ${EVENT_INFO.websiteUrl}\n\n${EVENT_INFO.hashtags}`,
    share: "Partager",
    shareLinkedIn: "Partager sur LinkedIn",
    download: "Télécharger l'image",
    copyCaption: "Copier le texte",
    copied: "Texte copié",
    linkedInSteps:
      "L'image a été téléchargée et le texte copié. Sur LinkedIn, ajoutez l'image à votre publication (icône photo). Le texte est déjà rempli.",
    shareFallback: "Votre appareil ne permet pas le partage direct\u00a0: l'image a été téléchargée.",
    rendering: "Préparation…",
    backToTicket: "Retour à mon billet",
  },
} satisfies Record<Language, unknown>;
