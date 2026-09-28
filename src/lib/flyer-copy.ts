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
      "Add your photo to make an “I’m attending” graphic for LinkedIn, Instagram or WhatsApp. Your photo stays on your device — it is never uploaded.",
    photo: "Your photo",
    photoChoose: "Choose a photo",
    photoChange: "Change photo",
    photoHint: "A clear, front-facing photo works best. Drag the photo to position it.",
    zoom: "Zoom",
    name: "Name",
    jobTitle: "Job title",
    organization: "Organisation",
    headline: "Headline",
    format: "Format",
    formats: { square: "Square · LinkedIn post", story: "Story · WhatsApp / Instagram" },
    headlines: {
      attending: "I'm attending",
      speaking: "I'm speaking at",
      join: "Join me at",
    } satisfies Record<Headline, string>,
    caption: "Post text",
    captionHint: "Edit it as you like. It's copied for you when you share.",
    defaultCaption: (headline: Headline) =>
      ({
        attending: `I'm excited to be attending the ${EVENT_INFO.name.en} in ${EVENT_INFO.place.en}, ${EVENT_INFO.date.en}! 🚀\n\nLooking forward to connecting with leaders shaping Africa's space industry. Will I see you there?`,
        speaking: `I'm honoured to be speaking at the ${EVENT_INFO.name.en} in ${EVENT_INFO.place.en}, ${EVENT_INFO.date.en}! 🚀\n\nLooking forward to the conversations on the future of Africa's space industry. Come and join us.`,
        join: `Join me at the ${EVENT_INFO.name.en} in ${EVENT_INFO.place.en}, ${EVENT_INFO.date.en}! 🚀\n\nThe gathering for everyone building Africa's space industry.`,
      })[headline] + `\n\nRegister: ${EVENT_INFO.websiteUrl}\n\n${EVENT_INFO.hashtags}`,
    share: "Share",
    shareLinkedIn: "Share on LinkedIn",
    download: "Download image",
    copyCaption: "Copy post text",
    copied: "Post text copied",
    linkedInSteps:
      "The image has been downloaded and your post text copied. In LinkedIn, add the image to your post (click the photo icon) — the text is already filled in.",
    shareFallback: "Your device couldn't share directly, so the image was downloaded instead.",
    rendering: "Preparing…",
    backToTicket: "Back to my ticket",
    namePlaceholder: "Your name",
  },
  fr: {
    kicker: "Partagez la nouvelle",
    title: "Créez votre visuel",
    intro:
      "Ajoutez votre photo pour créer un visuel « J’y serai » pour LinkedIn, Instagram ou WhatsApp. Votre photo reste sur votre appareil — elle n’est jamais envoyée.",
    photo: "Votre photo",
    photoChoose: "Choisir une photo",
    photoChange: "Changer de photo",
    photoHint: "Une photo nette, de face, donne le meilleur résultat. Faites glisser la photo pour la positionner.",
    zoom: "Zoom",
    name: "Nom",
    jobTitle: "Fonction",
    organization: "Organisation",
    headline: "Titre",
    format: "Format",
    formats: { square: "Carré · publication LinkedIn", story: "Story · WhatsApp / Instagram" },
    headlines: {
      attending: "J'y serai",
      speaking: "J'interviens à",
      join: "Rejoignez-moi à",
    } satisfies Record<Headline, string>,
    caption: "Texte de la publication",
    captionHint: "Modifiez-le à votre guise. Il est copié automatiquement lors du partage.",
    defaultCaption: (headline: Headline) =>
      ({
        attending: `Ravi(e) de participer à la ${EVENT_INFO.name.fr} à ${EVENT_INFO.place.fr}, ${EVENT_INFO.date.fr.toLowerCase()} ! 🚀\n\nHâte d'échanger avec les acteurs qui façonnent l'industrie spatiale africaine. Vous y serez ?`,
        speaking: `Honoré(e) d'intervenir à la ${EVENT_INFO.name.fr} à ${EVENT_INFO.place.fr}, ${EVENT_INFO.date.fr.toLowerCase()} ! 🚀\n\nAu programme : l'avenir de l'industrie spatiale africaine. Rejoignez-nous.`,
        join: `Rejoignez-moi à la ${EVENT_INFO.name.fr} à ${EVENT_INFO.place.fr}, ${EVENT_INFO.date.fr.toLowerCase()} ! 🚀\n\nLe rendez-vous de tous ceux qui construisent l'industrie spatiale africaine.`,
      })[headline] + `\n\nInscription : ${EVENT_INFO.websiteUrl}\n\n${EVENT_INFO.hashtags}`,
    share: "Partager",
    shareLinkedIn: "Partager sur LinkedIn",
    download: "Télécharger l'image",
    copyCaption: "Copier le texte",
    copied: "Texte copié",
    linkedInSteps:
      "L'image a été téléchargée et le texte copié. Sur LinkedIn, ajoutez l'image à votre publication (icône photo) — le texte est déjà rempli.",
    shareFallback: "Votre appareil ne permet pas le partage direct : l'image a été téléchargée.",
    rendering: "Préparation…",
    backToTicket: "Retour à mon billet",
    namePlaceholder: "Votre nom",
  },
} satisfies Record<Language, unknown>;
