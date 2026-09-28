// Event details shown on the shareable flyer (and anywhere else that needs
// them). From newspace.spaceinafrica.com: "Next edition: April 2027 ...
// Dakar, Senegal". Update `date` once the exact days are announced,
// e.g. { en: "20–23 April 2027", fr: "20–23 avril 2027" }.
export const EVENT_INFO = {
  name: { en: "NewSpace Africa Conference 2027", fr: "Conférence NewSpace Africa 2027" },
  date: { en: "April 2027", fr: "Avril 2027" },
  place: { en: "Dakar, Senegal", fr: "Dakar, Sénégal" },
  /** Short top-right mark on the flyer. */
  mark: ["DAKAR", "2027"] as [string, string],
  website: "newspace.spaceinafrica.com",
  websiteUrl: "https://newspace.spaceinafrica.com",
  hashtags: "#NewSpaceAfrica #SpaceInAfrica",
} as const;
