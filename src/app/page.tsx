import { AuthPanel } from "@/components/auth-panel";
import { CompetitionDashboard } from "@/components/competition-dashboard";
import { getCurrentSession } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getCurrentSession();

  if (!session) {
    return (
      <AuthPanel
        googleConfigured={Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        )}
      />
    );
  }

  return (
    <CompetitionDashboard
      initialUser={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role ?? "PARTICIPANT",
      }}
    />
  );
}
