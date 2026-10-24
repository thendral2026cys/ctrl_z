import assert from "node:assert/strict";
import test from "node:test";
import {
  digestFlag,
  digestInviteCode,
  isSafeHttpsUrl,
  matchesSecret,
  verifyFlag,
} from "../src/lib/security.ts";
import {
  eventTimeInput,
  eventTimeIso,
  isValidEventTimeZone,
} from "../src/lib/time.ts";

test("flag answers are stored as keyed digests and compared exactly", () => {
  process.env.FLAG_SECRET = "a-test-only-secret-that-is-at-least-32-characters";
  const digest = digestFlag("VW{device-restored}");

  assert.notEqual(digest, "VW{device-restored}");
  assert.equal(verifyFlag("VW{device-restored}", digest), true);
  assert.equal(verifyFlag("VW{different-answer}", digest), false);
  assert.equal(verifyFlag(" vw{device-restored} ", digest), false);
});

test("invite codes are hashed before storage", () => {
  const digest = digestInviteCode("one-time-random-team-invite");

  assert.notEqual(digest, "one-time-random-team-invite");
  assert.equal(digest, digestInviteCode("one-time-random-team-invite"));
});

test("secret comparison accepts only the exact configured value", () => {
  assert.equal(matchesSecret("valid-token", "valid-token"), true);
  assert.equal(matchesSecret("wrong-token", "valid-token"), false);
  assert.equal(matchesSecret("valid-token", undefined), false);
});

test("external URLs require HTTPS and reject embedded credentials", () => {
  assert.equal(isSafeHttpsUrl("https://video.example/watch/1"), true);
  assert.equal(isSafeHttpsUrl("http://video.example/watch/1"), false);
  assert.equal(isSafeHttpsUrl("https://user:pass@video.example/watch/1"), false);
  assert.equal(isSafeHttpsUrl("not a url"), false);
});

test("event times round-trip through the configured event timezone", () => {
  const value = "2026-10-24T00:00";
  const instant = eventTimeIso(value, "Asia/Kolkata");

  assert.equal(instant, "2026-10-23T18:30:00.000Z");
  assert.equal(eventTimeInput(instant, "Asia/Kolkata"), value);
});

test("event time conversion preserves the instant when changing timezones", () => {
  const instant = eventTimeIso("2026-10-24T10:15", "Asia/Kolkata");

  assert.equal(eventTimeInput(instant, "UTC"), "2026-10-24T04:45");
  assert.equal(eventTimeInput(instant, "America/New_York"), "2026-10-24T00:45");
  assert.equal(
    eventTimeIso(eventTimeInput(instant, "America/New_York"), "America/New_York"),
    instant,
  );
});

test("invalid event timezones are rejected with a useful message", () => {
  assert.equal(isValidEventTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidEventTimeZone("Not/A_Timezone"), false);
  assert.equal(isValidEventTimeZone("Asia/"), false);
  assert.throws(
    () => eventTimeIso("2026-10-24T10:15", "Not/A_Timezone"),
    /IANA event timezone/,
  );
});

test("invalid calendar dates are rejected", () => {
  assert.throws(
    () => eventTimeIso("2026-02-30T10:15", "UTC"),
    /valid event date and time/,
  );
  assert.throws(
    () => eventTimeIso("2026-10-24T24:00", "UTC"),
    /valid event date and time/,
  );
});

test("nonexistent daylight-saving wall-clock times are rejected", () => {
  assert.throws(
    () => eventTimeIso("2026-03-08T02:30", "America/New_York"),
    /does not exist/,
  );
});

test("repeated daylight-saving wall-clock times consistently use the earlier instant", () => {
  assert.equal(
    eventTimeIso("2026-11-01T01:30", "America/New_York"),
    "2026-11-01T05:30:00.000Z",
  );
});
