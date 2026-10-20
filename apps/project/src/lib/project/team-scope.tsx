import * as React from "react"

const TeamScopeContext = React.createContext<string | undefined>(undefined)

/**
 * The team a page shows, for the requests made under it: a team's dashboard
 * names the team in its address, and a project page names the project's team.
 * The site admin is on no team, so without it their requests would not know
 * which team they are about (Tyler, 19 Oct 2026: no team dropdown).
 */
export function TeamScope({ teamId, children }: { teamId: string | undefined; children: React.ReactNode }) {
  return <TeamScopeContext.Provider value={teamId}>{children}</TeamScopeContext.Provider>
}

/** The page's team, to send with a team-scoped request. */
export function useTeamId() {
  return React.useContext(TeamScopeContext)
}
