import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function digestInviteCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function getFlagSecret() {
  const secret = process.env.FLAG_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("FLAG_SECRET must contain at least 32 characters.");
  }

  return secret;
}

export function digestFlag(flag: string) {
  return createHmac("sha256", getFlagSecret())
    .update(flag.trim(), "utf8")
    .digest("hex");
}

export function verifyFlag(flag: string, expectedDigest: string) {
  const candidate = Buffer.from(digestFlag(flag), "hex");
  const expected = Buffer.from(expectedDigest, "hex");

  return (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
}

export function matchesSecret(value: string, expected: string | undefined) {
  if (!expected || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    throw new Error("A same-origin request is required.");
  }

  const expectedOrigin = new URL(
    process.env.APP_URL ?? request.url,
  ).origin;

  if (origin !== expectedOrigin) {
    throw new Error("Cross-origin requests are not allowed.");
  }
}
