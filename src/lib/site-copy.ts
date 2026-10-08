import type { SiteLanguage } from "@/lib/site-language";

// Text of the site header, phone menu and footer, in English and French.
// They follow the language of the page (see src/lib/site-language.ts).

export const SITE_COPY: Record<
  SiteLanguage,
  {
    skip: string;
    home: string;
    openMenu: string;
    closeMenu: string;
    register: string;
    form: string;
    flyer: string;
    privacy: string;
    terms: string;
    organisedBy: string;
    hostedBy: string;
    organiserSite: string;
  }
> = {
  en: {
    skip: "Skip to content",
    home: "NewSpace Africa Conference 2027 website",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    register: "Register",
    form: "Registration form",
    flyer: "Create your flyer",
    privacy: "Privacy",
    terms: "Terms",
    organisedBy: "Organised by",
    hostedBy: "Hosted by",
    organiserSite: "Space in Africa website",
  },
  fr: {
    skip: "Aller au contenu",
    home: "Site de la Conférence NewSpace Africa 2027",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    register: "S'inscrire",
    form: "Formulaire d'inscription",
    flyer: "Créer votre visuel",
    privacy: "Confidentialité",
    terms: "Conditions",
    organisedBy: "Organisé par",
    hostedBy: "Accueilli par",
    organiserSite: "Site de Space in Africa",
  },
};
