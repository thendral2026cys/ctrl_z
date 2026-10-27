import { redirect } from "next/navigation";
import { ChallengeWorkspace } from "@/components/challenge-workspace";
import { prisma } from "@/lib/db";
import { getCurrentSession, isMainAdminEmail } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/");
  const membership = await prisma.membership.findUnique({
    where: { userId: session.user.id },
    include: { team: true },
  });
  const teamName =
    membership && !membership.removedAt && !membership.team.disqualifiedAt
      ? membership.team.name
      : "No active team";
  const { id } = await params;

  return (
    <ChallengeWorkspace
      challengeId={id}
      userName={session.user.name}
      teamName={teamName}
      role={session.user.role ?? "PARTICIPANT"}
      canViewClue={
        isMainAdminEmail(session.user.email) ||
        session.user.role === "MAIN_ADMIN"
      }
    />
  );
}
