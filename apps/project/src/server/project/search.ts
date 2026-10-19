import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm"

import { taskNotesText } from "@/lib/project/notes"
import { LIMITS, type ProjectColor, type TaskStatus } from "@/lib/project/rules"
import { db } from "@/server/db"
import { isSiteAdmin, requireMembership, visibleProjectsWhere } from "@/server/project/access"
import { projectProjects, projectTasks } from "@/server/project/schema"

/**
 * The search in the header: every word typed, in a task's title or notes,
 * across every project the person can see and their own "Just me" list.
 * Archived projects count, since their tasks can still be read; the bin
 * doesn't. One query for the whole team, never one per project. The site
 * admin's search is on every page and covers every team.
 */

export type SearchHit = {
  id: string
  title: string
  status: TaskStatus
  project: { id: string; name: string; color: ProjectColor; personal: boolean; archived: boolean }
}

/**
 * Rows the database is asked for before the notes are read properly. The
 * notes are saved as the editor's document, so "%link%" can match a word in
 * its markup rather than in the text; those are dropped below, and this
 * leaves room for them.
 */
const CANDIDATES = 200

export async function searchTasks(userId: string, q: string, database = db): Promise<SearchHit[]> {
  const visible = (await isSiteAdmin(userId, database))
    ? undefined
    : visibleProjectsWhere(await requireMembership(userId, database))
  const words = wordsOf(q)
  if (words.length === 0) return []

  const inTitle = (word: string) => ilike(projectTasks.title, `%${escapeLike(word)}%`)
  const titleHasAll = and(...words.map(inTitle))
  const rows = await database
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      notes: projectTasks.notes,
      status: projectTasks.status,
      projectId: projectProjects.id,
      projectName: projectProjects.name,
      projectColor: projectProjects.color,
      personalUserId: projectProjects.personalUserId,
      archivedAt: projectProjects.archivedAt,
    })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(
      and(
        visible,
        isNull(projectTasks.deletedAt),
        ...words.map((word) =>
          or(inTitle(word), ilike(projectTasks.notes, `%${escapeLike(word)}%`))
        )
      )
    )
    // A title holding every word comes first, then the most recently changed.
    .orderBy(desc(sql`(${titleHasAll})`), desc(projectTasks.updatedAt))
    .limit(CANDIDATES)

  return rows
    .filter((row) => {
      // Words inside a # link are another task's title, which this reader may not see.
      const text = `${row.title}\n${taskNotesText(row.notes)}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
    .slice(0, LIMITS.searchResults)
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      project: {
        id: row.projectId,
        name: row.projectName,
        color: row.projectColor,
        personal: Boolean(row.personalUserId),
        archived: Boolean(row.archivedAt),
      },
    }))
}

function wordsOf(q: string) {
  return [...new Set(q.trim().toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 10)
}

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`)
}
