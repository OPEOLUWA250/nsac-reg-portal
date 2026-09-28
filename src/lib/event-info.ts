// Event details shown on the flyer, ticket, confirmation email and
// registration form. Change them here and every place updates.
export const EVENT_INFO = {
  name: { en: "NewSpace Africa Conference 2027", fr: "Conférence NewSpace Africa 2027" },
  date: { en: "19–23 April 2027", fr: "19–23 avril 2027" },
  /** First and last day (inclusive), for calendar invites. */
  startDate: "2027-04-19",
  endDate: "2027-04-23",
  /** The same dates, worded to sit inside a sentence (post text). */
  dateInSentence: { en: "from 19 to 23 April 2027", fr: "du 19 au 23 avril 2027" },
  place: { en: "Dakar, Senegal", fr: "Dakar, Sénégal" },
  /** Short top-right mark on the flyer. */
  mark: ["DAKAR", "2027"] as [string, string],
  website: "newspace.spaceinafrica.com",
  websiteUrl: "https://newspace.spaceinafrica.com",
  hashtags: "#NewSpaceAfrica #SpaceInAfrica",
} as const;
