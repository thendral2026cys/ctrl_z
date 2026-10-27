import { redirect } from "next/navigation";
import { CompetitionDashboard } from "@/components/competition-dashboard";
import { getCurrentSession } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");

  return (
    <CompetitionDashboard
      initialUser={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role ?? "PARTICIPANT",
      }}
      view="challenges"
    />
  );
}
