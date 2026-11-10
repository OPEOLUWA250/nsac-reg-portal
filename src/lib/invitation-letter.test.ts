import { describe, expect, it, vi } from "vitest";
import { buildLetter, letterFilename, letterReference, parseLetterInput, type LetterAttendee } from "@/lib/invitation-letter";

vi.mock("server-only", () => ({}));

const attendee: LetterAttendee = {
  id: "12345678-1234-4234-8234-123456789abc",
  full_name: "Ada  Óbí ",
  nationality: "Nigeria",
  residence_country: "Ghana",
  organization: "Sahel Orbital",
  job_title: "Chief Engineer",
  role: "speaker",
};

const input = { senderEmail: "Events@SpaceInAfrica.com ", signatoryName: " Ama  Mensah", signatoryTitle: "", passportNumber: "a 1234 567", language: "en" };

describe("invitation letter fields", () => {
  it("cleans up what the admin typed", () => {
    expect(parseLetterInput(input)).toEqual({
      value: {
        senderEmail: "events@spaceinafrica.com",
        signatoryName: "Ama Mensah",
        signatoryTitle: null,
        passportNumber: "A1234567",
        language: "en",
        copyToSender: true,
      },
    });
  });

  it("needs a sender email and a signatory", () => {
    expect(parseLetterInput({})).toEqual({ fields: { senderEmail: expect.any(String), signatoryName: expect.any(String) } });
    expect(parseLetterInput({ ...input, senderEmail: "not-an-email" })).toEqual({ fields: { senderEmail: expect.any(String) } });
  });

  it("refuses passport numbers that can't be real, and unknown languages", () => {
    expect(parseLetterInput({ ...input, passportNumber: "A1" })).toEqual({ fields: { passportNumber: expect.any(String) } });
    expect(parseLetterInput({ ...input, passportNumber: "<script>" })).toEqual({ fields: { passportNumber: expect.any(String) } });
    expect(parseLetterInput({ ...input, language: "de" })).toEqual({ fields: { language: expect.any(String) } });
  });
});

describe("the letter", () => {
  const value = (over = {}) => {
    const r = parseLetterInput({ ...input, ...over });
    if (!("value" in r)) throw new Error("invalid");
    return r.value;
  };

  it("fills in the attendee's details, and the passport number when given", () => {
    const letter = buildLetter(attendee, value(), new Date("2026-10-27T10:00:00Z"));
    expect(letter.reference).toBe("Ref. NSAC27-INV-12345678");
    expect(letter.date).toBe("27 October 2026");
    expect(Object.fromEntries(letter.details)).toEqual({
      "Full name": "Ada  Óbí",
      Nationality: "Nigeria",
      "Passport number": "A1234567",
      Position: "Chief Engineer",
      Organisation: "Sahel Orbital",
      "Country of residence": "Ghana",
      "Registration category": "Speaker",
    });
    expect(letter.paragraphs.at(-1)).toContain("events@spaceinafrica.com");
    expect(letter.signatoryName).toBe("Ama Mensah");
  });

  it("leaves out what isn't known", () => {
    const letter = buildLetter({ ...attendee, nationality: null, job_title: null }, value({ passportNumber: "" }));
    const labels = letter.details.map(([k]) => k);
    expect(labels).not.toContain("Nationality");
    expect(labels).not.toContain("Passport number");
  });

  it("never shows how many people have registered or asked for a letter", () => {
    for (const language of ["en", "fr"] as const) {
      const letter = buildLetter({ ...attendee, registration_number: 4321 } as LetterAttendee, value({ language }));
      expect(JSON.stringify(letter)).not.toContain("4321");
      expect(JSON.stringify(letter)).not.toMatch(/Registration number|Numéro d'inscription/);
    }
    expect(letterFilename({ ...attendee, registration_number: 4321 } as LetterAttendee)).not.toContain("4321");
  });

  it("is written in French when asked", () => {
    const letter = buildLetter(attendee, value({ language: "fr" }), new Date("2026-10-27T10:00:00Z"));
    expect(letter.salutation).toBe("Madame, Monsieur,");
    expect(letter.date).toBe("27 octobre 2026");
    expect(Object.fromEntries(letter.details)["Catégorie d'inscription"]).toBe("Intervenant(e)");
    expect(letter.intro).toContain("du 19 au 23 avril 2027");
  });

  it("names the file after the attendee", () => {
    expect(letterFilename(attendee)).toBe("invitation-letter-NSAC27-INV-12345678-ada-obi.pdf");
    expect(letterReference({ id: "0a1b2c3d-4e5f-4000-8000-000000000000" })).toBe("NSAC27-INV-0A1B2C3D");
  });

  it("draws as a one-page PDF and matching preview", async () => {
    const { renderLetterPages, renderLetterPdf } = await import("@/lib/server/invitation-letter-pdf");
    const letter = buildLetter(attendee, value({ signatoryTitle: "Conference Director" }));
    const pdf = await renderLetterPdf(letter);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = await renderLetterPages(letter);
    expect(pages).toHaveLength(1);
    expect(pages[0][0]).toBe(0xff); // JPEG
    // French runs longer: still one page.
    expect(await renderLetterPages(buildLetter(attendee, value({ signatoryTitle: "Directrice de la conférence", language: "fr" })))).toHaveLength(1);
  }, 20_000);
});
