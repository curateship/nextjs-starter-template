import { inArray } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { dockerConnection, dockerRequest } from "./docker"
import { promoBrowserSessions } from "./schema"
import { LIVE_STATUSES } from "./session"
import { BROWSER_MEMORY_MB, readBrowserSettings } from "./settings"

/**
 * How full the machine is, for the line at the top of the Browser profiles
 * dashboard: "2 of 3 browsers open, using about 2.1GB".
 *
 * Counted across every person, because the limit and the memory are the
 * machine's. Memory is Docker's own figure for each browser, the same one
 * `docker stats` prints. A browser Docker would not report on is counted at
 * its ceiling, so the figure errs high rather than hiding one.
 */
export type BrowserLoad = {
  open: number
  maxOpen: number
  memoryBytes: number
}

type DockerStats = {
  memory_stats?: { usage?: number; stats?: { inactive_file?: number; total_inactive_file?: number } }
}

export async function browserLoad(db: CustomShellDb = defaultDb): Promise<BrowserLoad> {
  const [{ maxOpen }, rows] = await Promise.all([
    readBrowserSettings(db),
    db
      .select({ containerId: promoBrowserSessions.containerId })
      .from(promoBrowserSessions)
      .where(inArray(promoBrowserSessions.status, [...LIVE_STATUSES])),
  ])

  const connection = rows.length ? dockerConnection() : null
  const figures = await Promise.all(
    rows.map(async ({ containerId }) => {
      if (!containerId || !connection) return null
      try {
        const stats = await dockerRequest<DockerStats>(
          connection,
          "GET",
          `/containers/${encodeURIComponent(containerId)}/stats?stream=false&one-shot=true`
        )
        return memoryInUse(stats)
      } catch {
        return null
      }
    })
  )

  const ceiling = BROWSER_MEMORY_MB * 1024 * 1024
  return {
    open: rows.length,
    maxOpen,
    memoryBytes: figures.reduce<number>((total, figure) => total + (figure ?? ceiling), 0),
  }
}

/**
 * What `docker stats` prints as a container's memory: its usage less the
 * file cache the kernel can drop at any moment. Null when Docker left it out.
 */
export function memoryInUse(stats: DockerStats): number | null {
  const usage = stats.memory_stats?.usage
  if (typeof usage !== "number") return null
  const cache = stats.memory_stats?.stats?.inactive_file ?? stats.memory_stats?.stats?.total_inactive_file ?? 0
  return Math.max(0, usage - cache)
}
