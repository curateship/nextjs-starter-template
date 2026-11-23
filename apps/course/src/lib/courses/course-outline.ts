/**
 * The order a course is read in. Chapters that sit under no part come first,
 * then each part in its own order with its chapters in theirs. The admin's
 * chapter list, the reader's left list and the next and previous buttons all
 * read this one function, so the three can never disagree.
 */

type Positioned = { id: string; position: number }
type GroupedChapter = Positioned & { groupId: string | null }

export function orderedChapters<Chapter extends GroupedChapter>(
  groups: readonly Positioned[],
  chapters: readonly Chapter[]
): Chapter[] {
  const byPosition = (a: Positioned, b: Positioned) =>
    a.position - b.position || a.id.localeCompare(b.id)
  const groupIds = new Set(groups.map((group) => group.id))
  // A chapter whose part has gone reads as one with no part, rather than
  // vanishing from the course.
  const loose = chapters
    .filter((chapter) => !chapter.groupId || !groupIds.has(chapter.groupId))
    .sort(byPosition)
  const grouped = [...groups].sort(byPosition).flatMap((group) =>
    chapters.filter((chapter) => chapter.groupId === group.id).sort(byPosition)
  )
  return [...loose, ...grouped]
}

/** The outline as the admin's list sends it back after a drag. */
export type CourseOutlineOrder = {
  /** Chapters above every part, top to bottom. */
  loose: string[]
  groups: { id: string; chapterIds: string[] }[]
}
