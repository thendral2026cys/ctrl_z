import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";

export const MAIN_ADMIN_EMAILS = [
  "thendralcys@gmail.com",
  "mistermanuniq@gmail.com",
  "admin@gmail.com",
] as const;

export function getMainAdminEmails(): string[] {
  const list: string[] = [...MAIN_ADMIN_EMAILS];
  const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (envEmail && !list.includes(envEmail)) {
    list.push(envEmail);
  }
  return list;
}

export function isMainAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  return getMainAdminEmails().some(
    (mainAdminEmail) => mainAdminEmail === normalizedEmail,
  );
}

const secret = process.env.BETTER_AUTH_SECRET;

if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
}

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  appName: "ctrl_z",
  baseURL: appUrl,
  secret: secret ?? "local-development-secret-change-before-deploy-00000000",
  trustedOrigins: [
    appUrl,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: false,
    },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          // Fire-and-forget: clean up old sessions for this user (non-blocking)
          void prisma.session.deleteMany({
            where: {
              userId: session.userId,
              id: { not: session.id },
            },
          }).catch((e: unknown) => {
            console.error("Session cleanup failed (non-critical):", e);
          });
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          if (user.email && isMainAdminEmail(user.email)) {
            try {
              await prisma.user.update({
                where: { id: user.id },
                data: { role: "MAIN_ADMIN", emailVerified: true },
              });
            } catch (err) {
              console.error("Failed to elevate main admin on creation:", err);
            }
          }
        },
      },
    },
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "PARTICIPANT",
        input: false,
      },
    },
  },
});
