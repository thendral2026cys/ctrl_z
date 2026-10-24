import { redirect } from "next/navigation";
import Link from "next/link";
import { FinalSubmissionPageClient } from "@/components/competition-dashboard";
import { getCurrentSession } from "@/lib/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function FinalSubmissionPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");

  const membership = await prisma.membership.findUnique({
    where: { userId: session.user.id },
    include: { team: true },
  });
  const config = await prisma.eventConfig.findUnique({ where: { id: "main" } });

  return (
    <main className="shell main-content">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">V</span>
          <span>VIPERWOLF</span>
        </Link>
        <Link className="btn-secondary" href="/">
          Return to investigation
        </Link>
      </header>
      <section className="panel">
        <div className="eyebrow">Independent team submission</div>
        <h1>Three story-related video links</h1>
        <p className="subtle">
          Submit exactly three HTTPS URLs. Your team can view and edit only its
          own submission. A URL is not evidence that a video was watched.
        </p>
        {!membership || membership.removedAt ? (
          <p className="message error">
            Join an active team before submitting links.
          </p>
        ) : !config?.finalSubmissionEnabled ? (
          <p className="message">
            The organizers have not opened final submissions.
          </p>
        ) : (
          <SubmissionGate
            teamId={membership.teamId}
            config={config}
          />
        )}
      </section>
    </main>
  );
}

async function SubmissionGate({
  teamId,
  config,
}: {
  teamId: string;
  config: NonNullable<Awaited<ReturnType<typeof prisma.eventConfig.findUnique>>>;
}) {
  const [finalMission, submission] = await Promise.all([
    prisma.challenge.findFirst({
      where: {
        round: { number: 3 },
        isFinalMission: true,
        solves: { some: { teamId } },
      },
      select: { id: true },
    }),
    prisma.finalSubmission.findUnique({
      where: { teamId },
      select: {
        firstUrl: true,
        secondUrl: true,
        thirdUrl: true,
        submittedAt: true,
      },
    }),
  ]);

  if (!finalMission) {
    return (
      <p className="message">
        Complete your team&apos;s final mission before submitting the links.
      </p>
    );
  }

  return (
    <FinalSubmissionPageClient
      config={{
        eventTimezone: config.eventTimezone,
        finalLinkOneLabel: config.finalLinkOneLabel,
        finalLinkOneDescription: config.finalLinkOneDescription,
        finalLinkTwoLabel: config.finalLinkTwoLabel,
        finalLinkTwoDescription: config.finalLinkTwoDescription,
        finalLinkThreeLabel: config.finalLinkThreeLabel,
        finalLinkThreeDescription: config.finalLinkThreeDescription,
      }}
      submission={
        submission
          ? {
              firstUrl: submission.firstUrl,
              secondUrl: submission.secondUrl,
              thirdUrl: submission.thirdUrl,
              submittedAt: submission.submittedAt.toISOString(),
            }
          : null
      }
    />
  );
}
