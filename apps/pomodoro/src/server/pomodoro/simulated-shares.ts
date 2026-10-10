import { asc, count, eq, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { readPixabayKey } from "@/server/pomodoro/pixabay-key"
import {
  pomodoroAuditLogs,
  pomodoroMediaUploads,
  pomodoroMemberImports,
  pomodoroSimulatedAccounts,
} from "@/server/pomodoro/schema"
import {
  MEMBER_IMPORT_MAX_LINKS,
  readMemberPixabayLink,
} from "@/lib/pomodoro/member-imports"

/**
 * "Give them files to share" on Settings → App settings → Made-up members
 * (uploads-and-sharing task 05, part 9), so "Shared by members" never looks
 * empty. Each Pixabay link becomes a member import for one made-up account,
 * the ones sharing least first, and the import worker shares the finished
 * file at once. Only Pixabay links are taken, never a file from anywhere
 * else, and nothing happens until an admin presses the button.
 */
export async function giveMadeUpMembersFiles({
  links,
  actorUserId,
}: {
  links: readonly string[]
  actorUserId: string
}) {
  if (!(await readPixabayKey().catch(() => null)))
    throw new Error("PIXABAY_IMPORTS_OFF")

  const refused: { line: number; reason: string }[] = []
  const wanted: { line: number; id: string; family: "image" | "video"; pageUrl: string; name: string }[] = []
  const seen = new Set<string>()
  links.slice(0, MEMBER_IMPORT_MAX_LINKS).forEach((raw, index) => {
    const line = index + 1
    const link = readMemberPixabayLink(raw)
    if (!link.ok) {
      refused.push({ line, reason: link.reason })
      return
    }
    const key = `${link.family}:${link.id}`
    if (seen.has(key)) {
      refused.push({ line, reason: "is the same item as a line above" })
      return
    }
    seen.add(key)
    wanted.push({ line, ...link })
  })
  if (!wanted.length) return { added: 0, refused }

  // The made-up accounts holding the fewest files go first, so the files
  // spread across many names rather than piling on one.
  const accounts = await db
    .select({ userId: pomodoroSimulatedAccounts.userId })
    .from(pomodoroSimulatedAccounts)
    .leftJoin(
      pomodoroMediaUploads,
      eq(pomodoroMediaUploads.userId, pomodoroSimulatedAccounts.userId)
    )
    .groupBy(pomodoroSimulatedAccounts.userId)
    .orderBy(asc(count(pomodoroMediaUploads.mediaId)), sql`random()`)
    .limit(wanted.length)
  if (!accounts.length) throw new Error("NO_MADE_UP_MEMBERS")

  const ids = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(pomodoroMemberImports)
      .values(
        wanted.map((link, index) => ({
          userId: accounts[index % accounts.length].userId,
          url: link.pageUrl,
          family: link.family,
          pixabayId: link.id,
          name: link.name.slice(0, 80),
          madeUpShare: true,
        }))
      )
      .returning({ id: pomodoroMemberImports.id })
    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: "made_up_share",
      resource: "simulated",
      recordIds: rows.map((row) => row.id),
    })
    return rows
  })
  refused.sort((a, b) => a.line - b.line)
  return { added: ids.length, refused }
}
