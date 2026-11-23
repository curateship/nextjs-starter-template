import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  addChapter,
  createCourse,
  loadCourseOutlineForEdit,
  saveCourseOrder,
  addGroup,
  updateChapter,
  updateCourse,
} from "@/server/courses/courses"
import { loadCourseStats } from "@/server/courses/course-admin"
import {
  answerQuiz,
  askQuestion,
  deleteOwnQuestion,
  MAX_QUESTIONS_AN_HOUR,
  setChapterDone,
  tickChecklistItem,
} from "@/server/courses/member"
import { readChapter, readCourseIntro, readPublicCourses, type Reader } from "@/server/courses/reader"
import { courseStarts } from "@/server/courses/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The reader's promises: a locked chapter is sent without its words, a quiz
 * without its answers, drafts never reach a visitor, held-back chapters count
 * from the member's first visit, member actions on a locked chapter are
 * refused, and nothing an admin reads is counted.
 */

let client: PGlite
let database: TestDatabase
let site: string

const signedOut: Reader = {
  userId: null,
  rules: { signedIn: false, isAdmin: false, isPaid: false, planId: null },
  viewer: { signedIn: false, isAdmin: false, previewingAsFree: false },
}

function member(userId: string, isPaid = false): Reader {
  return {
    userId,
    rules: { signedIn: true, isAdmin: false, isPaid, planId: isPaid ? "pro" : "free" },
    viewer: { signedIn: true, isAdmin: false, previewingAsFree: false },
  }
}

function admin(userId: string): Reader {
  return {
    userId,
    rules: { signedIn: true, isAdmin: true, isPaid: false, planId: null },
    viewer: { signedIn: true, isAdmin: true, previewingAsFree: false },
  }
}

const quizBody = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Secret words" }] },
    { type: "checklist", attrs: { items: [{ id: "step1", text: "Do it" }] } },
    {
      type: "quiz",
      attrs: {
        questions: [
          {
            id: "q1",
            prompt: "Pick B",
            choices: [
              { id: "a", text: "A" },
              { id: "b", text: "B" },
            ],
            answerId: "b",
          },
        ],
      },
    },
  ],
}

/** A published paid course: a free preview chapter, then a paid one. */
async function paidCourse() {
  const course = await createCourse(site, { title: "Notion basics" }, database)
  await updateCourse(site, course.id, { status: "published", access: "paid" }, database)
  const outline = await loadCourseOutlineForEdit(site, course.id, database)
  const intro = outline!.chapters[0]
  await updateChapter(site, intro.id, { status: "published", isPreview: true }, database)
  const paid = await addChapter(site, course.id, { title: "Databases", groupId: null }, database)
  await updateChapter(site, paid.id, { status: "published", body: quizBody }, database)
  return { course, intro, paid }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("reading", () => {
  it("sends a locked chapter without its words and a free preview with them", async () => {
    await paidCourse()

    const preview = await readChapter(site, "notion-basics", "introduction", signedOut, database)
    expect(preview?.chapter.lockReason).toBeNull()
    expect(preview?.chapter.body).not.toBeNull()

    const locked = await readChapter(site, "notion-basics", "databases", signedOut, database)
    expect(locked?.chapter.body).toBeNull()
    expect(locked?.chapter.lockReason).toBe("sign-in")
    expect(JSON.stringify(locked)).not.toContain("Secret words")

    const user = await insertUser(database)
    const free = await readChapter(site, "notion-basics", "databases", member(user.id), database)
    expect(free?.chapter.lockReason).toBe("upgrade")
    expect(free?.chapter.body).toBeNull()

    const paid = await readChapter(site, "notion-basics", "databases", member(user.id, true), database)
    expect(paid?.chapter.body).not.toBeNull()
    // The quiz arrives without its answer.
    expect(JSON.stringify(paid?.chapter.body)).not.toContain('"answerId":"b"')
  })

  it("never shows a draft course or a draft chapter to a visitor", async () => {
    const course = await createCourse(site, { title: "Hidden" }, database)
    expect(await readCourseIntro(site, "hidden", signedOut, database)).toBeNull()
    expect((await readPublicCourses(site, signedOut, database)).courses).toHaveLength(0)

    await updateCourse(site, course.id, { status: "published" }, database)
    const intro = await readCourseIntro(site, "hidden", signedOut, database)
    // Its one chapter is still a draft, so the outline is empty.
    expect(intro?.outline.chapters).toHaveLength(0)
    expect(await readChapter(site, "hidden", "introduction", signedOut, database)).toBeNull()
  })

  it("keeps one site's courses off another site", async () => {
    await paidCourse()
    const other = (await insertWorkspace(database)).id
    expect(await readCourseIntro(other, "notion-basics", signedOut, database)).toBeNull()
  })

  it("holds a chapter back until N days after the member first opened the course", async () => {
    const { course, paid } = await paidCourse()
    await updateCourse(site, course.id, { access: "members" }, database)
    await updateChapter(site, paid.id, { opensAfterDays: 3 }, database)
    const user = await insertUser(database)

    const first = await readChapter(site, "notion-basics", "databases", member(user.id), database)
    expect(first?.chapter.lockReason).toBe("waiting")
    expect(first?.chapter.opensAt).toBeInstanceOf(Date)

    // Started a week ago, so it is open now.
    await database
      .update(courseStarts)
      .set({ startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
      .where(eq(courseStarts.userId, user.id))
    const later = await readChapter(site, "notion-basics", "databases", member(user.id), database)
    expect(later?.chapter.body).not.toBeNull()
  })

  it("reads chapters in part order", async () => {
    const { course, intro, paid } = await paidCourse()
    const part = await addGroup(site, course.id, { title: "Part 1" }, database)
    await saveCourseOrder(
      site,
      course.id,
      { loose: [paid.id], groups: [{ id: part.id, chapterIds: [intro.id] }] },
      database
    )
    const user = await insertUser(database)
    const page = await readCourseIntro(site, "notion-basics", member(user.id, true), database)
    expect(page?.outline.chapters.map((chapter) => chapter.slug)).toEqual([
      "databases",
      "introduction",
    ])
    expect(page?.outline.groups.map((group) => group.title)).toEqual(["Part 1"])
  })
})

describe("addresses", () => {
  it("follow a draft's name until it is published or typed", async () => {
    const course = await createCourse(site, { title: "Draft name" }, database)
    const chapter = await addChapter(site, course.id, { title: "New chapter", groupId: null }, database)
    const renamed = await updateChapter(site, chapter.id, { title: "Your first database" }, database)
    expect(renamed.slug).toBe("your-first-database")

    const typed = await updateChapter(site, chapter.id, { slug: "databases" }, database)
    expect(typed.slug).toBe("databases")
    expect((await updateChapter(site, chapter.id, { title: "Other" }, database)).slug).toBe(
      "databases"
    )

    expect((await updateCourse(site, course.id, { title: "Real name" }, database)).slug).toBe(
      "real-name"
    )
    await updateCourse(site, course.id, { status: "published" }, database)
    expect((await updateCourse(site, course.id, { title: "Changed" }, database)).slug).toBe(
      "real-name"
    )
  })
})

describe("member actions", () => {
  it("are refused on a chapter the member may not read", async () => {
    const { paid } = await paidCourse()
    const user = await insertUser(database)
    await expect(setChapterDone(site, member(user.id), paid.id, true, database)).rejects.toThrow(
      "isn't open to you"
    )
    await expect(
      tickChecklistItem(site, member(user.id), paid.id, "step1", true, database)
    ).rejects.toThrow("isn't open to you")
  })

  it("check a quiz on the server and keep the answers", async () => {
    const { paid } = await paidCourse()
    const user = await insertUser(database)
    const reader = member(user.id, true)
    const results = await answerQuiz(site, reader, paid.id, { q1: "a" }, database)
    expect(results.q1).toEqual({ choiceId: "a", correct: false, rightChoiceId: "b" })

    await answerQuiz(site, reader, paid.id, { q1: "b" }, database)
    const page = await readChapter(site, "notion-basics", "databases", reader, database)
    expect(page?.member?.quiz.q1).toMatchObject({ choiceId: "b", correct: true })
  })

  it("let a member ask a limited number of questions an hour", async () => {
    const { intro } = await paidCourse()
    const user = await insertUser(database)
    for (let index = 0; index < MAX_QUESTIONS_AN_HOUR; index += 1) {
      await askQuestion(site, member(user.id), intro.id, `Question ${index}`, database)
    }
    await expect(
      askQuestion(site, member(user.id), intro.id, "One too many", database)
    ).rejects.toThrow("questions an hour")
  })

  it("let a member delete their own question after the chapter locks, and nobody else's", async () => {
    const { paid } = await paidCourse()
    const asker = await insertUser(database)
    const other = await insertUser(database)
    const [question] = await askQuestion(site, member(asker.id, true), paid.id, "Why?", database)

    await expect(
      deleteOwnQuestion(site, member(other.id, true), question.id, database)
    ).rejects.toThrow("already gone")
    // The plan ended, so the chapter is locked for them now.
    expect(await deleteOwnQuestion(site, member(asker.id), question.id, database)).toEqual([])
  })

  it("mark the course finished once every chapter is done", async () => {
    const { intro, paid } = await paidCourse()
    const user = await insertUser(database)
    const reader = member(user.id, true)
    await setChapterDone(site, reader, intro.id, true, database)
    expect(
      (await readChapter(site, "notion-basics", "databases", reader, database))?.finishedCourse
    ).toBe(false)
    await setChapterDone(site, reader, paid.id, true, database)
    expect(
      (await readChapter(site, "notion-basics", "databases", reader, database))?.finishedCourse
    ).toBe(true)
  })
})

describe("stats", () => {
  it("count members and never an admin", async () => {
    const { course } = await paidCourse()
    const reader = await insertUser(database)
    const boss = await insertUser(database, { role: "admin" })
    await readChapter(site, "notion-basics", "databases", member(reader.id, true), database)
    await readChapter(site, "notion-basics", "databases", admin(boss.id), database)

    const stats = await loadCourseStats(site, course.id, database)
    expect(stats.readers).toBe(1)
    expect(stats.rows.find((row) => row.title === "Databases")).toMatchObject({
      opened: 1,
      stoppedHere: 1,
    })
  })
})
