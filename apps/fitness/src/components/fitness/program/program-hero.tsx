import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { ProgramActionsMenu, ProgramSettingsWindow } from "@/components/fitness/program/program-actions"
import type { ProgramPageData } from "@/components/fitness/program/program-data"
import { TONE } from "@/components/fitness/status-tones"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { routineTypeLabel } from "@/lib/fitness/routine-types"
import { cn } from "@/lib/utils"

/**
 * The top of a program's left panel, drawn as the UI standard's three-column
 * rules and Project's project page draw a record's left panel:
 *
 * - The header: the arrow back to Programs, the program's name, its three-dot
 *   actions and the cog that opens its settings.
 * - The banner, if there is one, lies behind the header and the top of the
 *   panel at 30 out of 100 strength and fades into it, so the header still
 *   reads over it.
 * - The round picture, if there is one, sits at the banner's foot with the
 *   name, the routine type and the status beside it. Without one the routine
 *   type and status take a line of their own. Nothing stands in for a missing
 *   picture.
 *
 * Both pictures are set in the settings window's Pictures card.
 * `children` is the rest of the panel, drawn over the banner's fade.
 */
export function ProgramHero({ data, children }: { data: ProgramPageData; children: React.ReactNode }) {
  const navigate = useNavigate()
  const { program } = data
  // A picture whose address no longer loads is left out rather than drawn broken.
  const [broken, setBroken] = React.useState<string[]>([])
  const lose = (url: string) => setBroken((was) => [...was, url])
  const banner = program.bannerUrl && !broken.includes(program.bannerUrl) ? program.bannerUrl : null
  const avatar = program.avatarUrl && !broken.includes(program.avatarUrl) ? program.avatarUrl : null

  const status = (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
      <span className="truncate">{routineTypeLabel(program.routineType)}</span>
      {program.isActive ? (
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", TONE.positive)}>
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          Active
        </span>
      ) : null}
      {data.pause ? <Badge variant="outline" className="shrink-0">Paused</Badge> : null}
      {program.archived ? <Badge variant="outline" className="shrink-0">Archived</Badge> : null}
    </span>
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {banner ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 overflow-hidden rounded-t-[inherit]">
          <img src={banner} alt="" className="size-full object-cover opacity-30" onError={() => lose(banner)} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
        </div>
      ) : null}
      <DashboardCardTitleHeader
        // Over a banner the line goes see-through rather than away, so the header keeps its height.
        className={cn("relative", banner && "border-b-transparent")}
        back={{ label: "Back to programs", to: "/programs" }}
        title={program.name}
        action={
          <div className="flex items-center gap-1">
            <ProgramActionsMenu data={data} />
            <ProgramSettingsWindow data={data} onDeleted={() => void navigate({ to: "/programs" })} />
          </div>
        }
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-3 pt-3">
          {avatar ? (
            // Its middle level with the banner's foot.
            <div className={cn("flex min-w-0 items-center gap-3", banner && "mt-6")}>
              <span className="flex size-16 shrink-0 overflow-hidden rounded-full border-2 border-card bg-muted shadow-sm">
                <img src={avatar} alt="" className="size-full object-cover" onError={() => lose(avatar)} />
              </span>
              <div className="grid min-w-0 gap-1">
                <p className="truncate text-base leading-tight font-semibold">{program.name}</p>
                {status}
              </div>
            </div>
          ) : (
            status
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
