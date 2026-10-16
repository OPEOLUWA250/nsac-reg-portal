import { describe, expect, it } from "vitest";
import { cleanAlertEmails, MAX_ALERT_EMAILS, mergeAlertRecipients, parseAlertEmailList } from "./alert-emails";

describe("the Settings box", () => {
  it("takes one address per line, or commas, lower-cased and without repeats", () => {
    expect(parseAlertEmailList(" Ada@Example.com\n\nbo@example.org, ada@example.com;cy@example.net ")).toEqual({
      emails: ["ada@example.com", "bo@example.org", "cy@example.net"],
      invalid: [],
    });
  });

  it("names what isn't an email address", () => {
    expect(parseAlertEmailList("ada@example.com\nbo@example\nnot-an-email")).toEqual({
      emails: ["ada@example.com"],
      invalid: ["bo@example", "not-an-email"],
    });
  });

  it("accepts addresses pasted from a mail app", () => {
    expect(parseAlertEmailList("<ada@example.com>").emails).toEqual(["ada@example.com"]);
  });
});

describe("a saved list", () => {
  it("must be email addresses only", () => {
    expect(cleanAlertEmails(["ada@example.com", "BO@example.org"])).toEqual(["ada@example.com", "bo@example.org"]);
    expect(cleanAlertEmails([])).toEqual([]);
    expect(cleanAlertEmails(["ada@example.com", "nope"])).toBeNull();
    expect(cleanAlertEmails("ada@example.com")).toBeNull();
    expect(cleanAlertEmails([1])).toBeNull();
    expect(cleanAlertEmails(undefined)).toBeNull();
  });

  it(`holds at most ${MAX_ALERT_EMAILS} addresses`, () => {
    const many = Array.from({ length: MAX_ALERT_EMAILS + 1 }, (_, i) => `p${i}@example.com`);
    expect(cleanAlertEmails(many.slice(0, MAX_ALERT_EMAILS))).toHaveLength(MAX_ALERT_EMAILS);
    expect(cleanAlertEmails(many)).toBeNull();
  });
});

it("emails everyone on the dashboard list and the server setting once each", () => {
  expect(mergeAlertRecipients(["Opeoluwa@spaceinafrica.com"], ["opeoluwa@spaceinafrica.com", "team@spaceinafrica.com"])).toEqual([
    "opeoluwa@spaceinafrica.com",
    "team@spaceinafrica.com",
  ]);
  expect(mergeAlertRecipients([], [])).toEqual([]);
});
