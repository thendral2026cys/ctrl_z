import { redirect } from "next/navigation";
import { CompetitionNavigation } from "@/components/competition-navigation";
import { getRankedTeamLeaderboard } from "@/lib/competition";
import { getCurrentSession } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");

  const teams = await getRankedTeamLeaderboard();

  return (
    <div className="shell app-layout">
      <CompetitionNavigation
        activePage="leaderboard"
        userName={session.user.name}
        teamName="Competition"
        role={session.user.role}
      />
      <main className="main-content">
        <section className="panel" aria-labelledby="leaderboard-heading">
          <h1 id="leaderboard-heading">Leaderboard</h1>
          <p className="subtle">
            Teams rank by total points. Equal scores are ordered by the earliest
            successful challenge solve; teams with the same score and solve
            time share a rank.
          </p>
          {teams.length === 0 ? (
            <p className="subtle">No teams are currently listed.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Team</th>
                    <th scope="col">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id}>
                      <td className="rank">{team.rank}</td>
                      <td>{team.name}</td>
                      <td>{team.score.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
