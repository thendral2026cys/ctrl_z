import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

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

function getFlagEncryptionKey() {
  const secret =
    process.env.BETTER_AUTH_SECRET ??
    (process.env.NODE_ENV === "production"
      ? ""
      : "local-development-secret-change-before-deploy-00000000");
  if (secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET must contain at least 32 characters to encrypt challenge answers.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptFlag(flag: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getFlagEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(flag, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptFlag(encryptedFlag: string) {
  const [version, nonceValue, tagValue, ciphertextValue] =
    encryptedFlag.split(":");
  if (
    version !== "v1" ||
    !nonceValue ||
    !tagValue ||
    ciphertextValue === undefined
  ) {
    throw new Error("Stored challenge answer has an unsupported format.");
  }
  const nonce = Buffer.from(nonceValue, "base64url");
  const authTag = Buffer.from(tagValue, "base64url");
  if (nonce.length !== 12 || authTag.length !== 16) {
    throw new Error("Stored challenge answer is malformed.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getFlagEncryptionKey(),
    nonce,
  );
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
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

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    // Failing open here would silently disable CSRF protection, so we fail
    // closed. Set APP_URL in your environment (e.g. http://localhost:3000).
    throw new Error(
      "APP_URL environment variable must be set to enable same-origin enforcement.",
    );
  }

  const expectedOrigin = new URL(appUrl).origin;

  if (origin !== expectedOrigin) {
    throw new Error("Cross-origin requests are not allowed.");
  }
}
