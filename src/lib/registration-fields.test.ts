import { describe, expect, it } from "vitest";
import { registrationAgreementErrors, validateRegistration } from "./registration-fields";

const valid = {
  id: "12345678-1234-4234-8234-123456789abc",
  category: "delegate", firstName: "Ada", lastName: "Example", email: "ada@example.com",
  jobTitle: "Engineer", phone: "+2348012345678", nationality: "NG", residenceCountry: "NG",
  organization: "Example", organizationCountry: "NG", professionalCategory: "industry",
  jobFunction: "engineering", invitationLetter: "no", foodAllergies: "None", ticket: "standard",
  safetyConsent: true, optInOrganizer: true, optInSponsors: true, shareDetails: "yes",
};

describe("required registration agreements", () => {
  it.each(["yes", "no"])("accepts the explicit sharing choice %s", (shareDetails) => {
    const input = { ...valid, shareDetails };
    expect(registrationAgreementErrors(input)).toEqual({});
    const result = validateRegistration(input, ["standard"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.shareDetails).toBe(shareDetails === "yes");
  });

  for (const field of ["safetyConsent", "optInOrganizer", "optInSponsors"] as const) {
    it.each([false, undefined, "true", 1])(`blocks checkout when ${field} is %s`, (value) => {
      const input = { ...valid, [field]: value };
      expect(registrationAgreementErrors(input)[field]).toBe("consent_required");
      const result = validateRegistration(input, ["standard"]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[field]).toBe("consent_required");
    });
  }

  it.each(["", undefined, null, true, false, "maybe"])("blocks checkout without a valid sharing choice: %s", (shareDetails) => {
    const input = { ...valid, shareDetails };
    expect(registrationAgreementErrors(input).shareDetails).toBeTruthy();
    const result = validateRegistration(input, ["standard"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.shareDetails).toBeTruthy();
  });
});
