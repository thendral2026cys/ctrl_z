import Link from "next/link";
import { redirect } from "next/navigation";
import { getRankedTeamLeaderboard } from "@/lib/competition";
import { getCurrentSession } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");

  const teams = await getRankedTeamLeaderboard();
  const chartTeams = teams.slice(0, 10);
  const highestScore = Math.max(1, ...chartTeams.map((team) => team.score));

  return (
    <main className="shell main-content">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">V</span>
          <span>VIPERWOLF</span>
        </Link>
        <Link className="btn-secondary" href="/">
          Return to competition
        </Link>
      </header>

      <section className="panel">
        <div className="eyebrow">Live team standings</div>
        <h1>Leaderboard</h1>
        <p className="subtle">
          Rankings use verified team points, Round 1 team totals, and audited
          organizer adjustments. Teams with equal scores share the same rank.
        </p>
      </section>

      <section className="panel" aria-labelledby="leaderboard-chart-heading">
        <div className="eyebrow">Score comparison</div>
        <h2 id="leaderboard-chart-heading">Top 10 teams by points</h2>
        {chartTeams.length === 0 ? (
          <p className="subtle">Scores will appear when teams are registered.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <svg
              aria-labelledby="leaderboard-chart-heading"
              role="img"
              viewBox={`0 0 1000 ${chartTeams.length * 58 + 16}`}
              style={{ display: "block", width: "100%", minWidth: 620 }}
            >
              {chartTeams.map((team, index) => {
                const y = index * 58 + 8;
                const width = (team.score / highestScore) * 660;
                return (
                  <g key={team.id}>
                    <text
                      fill="currentColor"
                      fontSize="15"
                      fontWeight="700"
                      x="0"
                      y={y + 22}
                    >
                      {team.rank}.
                    </text>
                    <text
                      fill="currentColor"
                      fontSize="15"
                      x="42"
                      y={y + 22}
                    >
                      {team.name.length > 34
                        ? `${team.name.slice(0, 31)}…`
                        : team.name}
                    </text>
                    <rect
                      x="320"
                      y={y}
                      width="660"
                      height="30"
                      rx="8"
                      fill="rgba(255,255,255,0.07)"
                    />
                    {width > 0 && (
                      <rect
                        x="320"
                        y={y}
                        width={width}
                        height="30"
                        rx="8"
                        fill="#38bdf8"
                      />
                    )}
                    <text
                      fill="currentColor"
                      fontSize="14"
                      fontWeight="700"
                      textAnchor="end"
                      x="1000"
                      y={y + 21}
                    >
                      {team.score.toLocaleString()} pts
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="leaderboard-table-heading">
        <div className="eyebrow">Full standings</div>
        <h2 id="leaderboard-table-heading">All teams ({teams.length})</h2>
        {teams.length === 0 ? (
          <p className="subtle">No teams have been registered yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Team</th>
                  <th scope="col">Team points</th>
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
        <p className="subtle">
          Individual scores are not displayed. Equal scores use competition
          ranking (for example, 1, 1, 3), with team names providing a consistent
          display order within ties.
        </p>
      </section>
    </main>
  );
}
