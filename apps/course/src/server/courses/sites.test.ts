import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  answerQuestion,
  countUnansweredQuestions,
  deleteQuestion,
  listCourseQuestions,
  loadCourseStats,
} from "@/server/courses/course-admin"
import {
  addChapter,
  addGroup,
  createCourse,
  deleteChapter,
  deleteCourses,
  deleteGroup,
  listCourses,
  loadCourseOutlineForEdit,
  renameGroup,
  saveCourseOrder,
  updateChapter,
  updateCourse,
} from "@/server/courses/courses"
import { readCoursesRow } from "@/server/courses/courses-row"
import {
  answerQuiz,
  askQuestion,
  deleteOwnQuestion,
  saveNote,
  setBookmark,
  setChapterDone,
  tickChecklistItem,
} from "@/server/courses/member"
import {
  chapterAddress,
  readChapter,
  readPublicCourses,
  readSavedChapters,
  type Reader,
} from "@/server/courses/reader"
import {
  courseBookmarks,
  courseChapterProgress,
  courseChapters,
  courseGroups,
  courseQuestions,
  courses,
} from "@/server/courses/schema"
import { COPY_COURSES_CHOICE, copySiteCourses } from "@/server/courses/site-copy"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * One deployment, several sites. A course, a chapter, a part or a question
 * belongs to the site it was written on, and its id sent to any other site's
 * address is "not found" for reading, for every member action and for every
 * admin door. Then the two things a site adds: the Courses row on its front
 * page, and Copy courses when an admin copies a site.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

function paidMember(userId: string): Reader {
  return {
    userId,
    rules: { signedIn: true, isAdmin: false, isPaid: true, planId: "pro" },
    viewer: { signedIn: true, isAdmin: false, previewingAsFree: false },
  }
}

const signedOut: Reader = {
  userId: null,
  rules: { signedIn: false, isAdmin: false, isPaid: false, planId: null },
  viewer: { signedIn: false, isAdmin: false, previewingAsFree: false },
}

const quizBody = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Alpha's words" }] },
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

/** A published course on Alpha, open to everyone, with one part. */
async function alphaCourse() {
  const course = await createCourse(alpha, { title: "Notion basics" }, database)
  await updateCourse(alpha, course.id, { status: "published" }, database)
  const outline = await loadCourseOutlineForEdit(alpha, course.id, database)
  const chapter = outline!.chapters[0]
  await updateChapter(alpha, chapter.id, { status: "published", body: quizBody }, database)
  const group = await addGroup(alpha, course.id, { title: "Part one" }, database)
  return { course, chapter, group }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

describe("a course on one site, asked for on another", () => {
  it("is not found by any reader", async () => {
    const { chapter } = await alphaCourse()
    const user = await insertUser(database)

    expect((await readPublicCourses(beta, signedOut, database)).courses).toEqual([])
    expect(
      await readChapter(beta, "notion-basics", chapter.slug, paidMember(user.id), database)
    ).toBeNull()
    expect(await chapterAddress(beta, chapter.id, paidMember(user.id), database)).toBeNull()
    // The same chapter on its own site, so the nulls above are about the site.
    expect(await chapterAddress(alpha, chapter.id, paidMember(user.id), database)).not.toBeNull()
  })

  it("refuses every member action and writes nothing", async () => {
    const { chapter } = await alphaCourse()
    const user = await insertUser(database)
    const reader = paidMember(user.id)

    await expect(setChapterDone(beta, reader, chapter.id, true, database)).rejects.toThrow()
    await expect(setBookmark(beta, reader, chapter.id, true, database)).rejects.toThrow()
    await expect(saveNote(beta, reader, chapter.id, "a note", database)).rejects.toThrow()
    await expect(
      tickChecklistItem(beta, reader, chapter.id, "step1", true, database)
    ).rejects.toThrow()
    await expect(answerQuiz(beta, reader, chapter.id, { q1: "b" }, database)).rejects.toThrow()
    await expect(askQuestion(beta, reader, chapter.id, "Why?", database)).rejects.toThrow()

    expect(await database.select().from(courseChapterProgress)).toEqual([])
    expect(await database.select().from(courseBookmarks)).toEqual([])
    expect(await database.select().from(courseQuestions)).toEqual([])
  })

  it("keeps a member's own question and saved chapter on the site they were made on", async () => {
    const { chapter } = await alphaCourse()
    const user = await insertUser(database)
    const reader = paidMember(user.id)
    await setBookmark(alpha, reader, chapter.id, true, database)
    const [question] = await askQuestion(alpha, reader, chapter.id, "Why?", database)

    expect(await readSavedChapters(beta, user.id, database)).toEqual([])
    expect(await readSavedChapters(alpha, user.id, database)).toHaveLength(1)
    await expect(deleteOwnQuestion(beta, reader, question.id, database)).rejects.toThrow()
    expect(await database.select().from(courseQuestions)).toHaveLength(1)
  })

  it("refuses every admin door and changes nothing", async () => {
    const { course, chapter, group } = await alphaCourse()
    const user = await insertUser(database)
    const [question] = await askQuestion(
      alpha,
      paidMember(user.id),
      chapter.id,
      "Why?",
      database
    )

    expect(await listCourses(beta, database)).toEqual([])
    expect(await loadCourseOutlineForEdit(beta, course.id, database)).toBeNull()
    await expect(updateCourse(beta, course.id, { title: "Taken" }, database)).rejects.toThrow()
    await expect(updateChapter(beta, chapter.id, { title: "Taken" }, database)).rejects.toThrow()
    await expect(deleteChapter(beta, chapter.id, database)).rejects.toThrow()
    await expect(
      addChapter(beta, course.id, { title: "Extra", groupId: null }, database)
    ).rejects.toThrow()
    await expect(addGroup(beta, course.id, { title: "Extra" }, database)).rejects.toThrow()
    await expect(
      renameGroup(beta, course.id, group.id, { title: "Taken" }, database)
    ).rejects.toThrow()
    await expect(deleteGroup(beta, course.id, group.id, database)).rejects.toThrow()
    await expect(
      saveCourseOrder(beta, course.id, { loose: [chapter.id], groups: [] }, database)
    ).rejects.toThrow()
    await expect(listCourseQuestions(beta, course.id, database)).rejects.toThrow()
    await expect(countUnansweredQuestions(beta, course.id, database)).rejects.toThrow()
    await expect(
      answerQuestion(beta, course.id, question.id, "Because", database)
    ).rejects.toThrow()
    await expect(deleteQuestion(beta, course.id, question.id, database)).rejects.toThrow()
    await expect(loadCourseStats(beta, course.id, database)).rejects.toThrow()
    // Deleting by id from the wrong site deletes nothing.
    await deleteCourses(beta, [course.id], database)

    const [kept] = await database.select().from(courses).where(eq(courses.id, course.id))
    expect(kept.title).toBe("Notion basics")
    const [keptChapter] = await database
      .select()
      .from(courseChapters)
      .where(eq(courseChapters.id, chapter.id))
    expect(keptChapter.title).not.toBe("Taken")
    expect(await database.select().from(courseGroups)).toHaveLength(1)
    const [keptQuestion] = await database.select().from(courseQuestions)
    expect(keptQuestion.answer ?? "").toBe("")
  })
})

describe("the Courses row on a site's front page", () => {
  const open = async () => true

  it("shows that site's published courses and none of another site's", async () => {
    await alphaCourse()
    const draft = await createCourse(alpha, { title: "Not ready" }, database)
    expect(draft.status).toBe("draft")

    const row = await readCoursesRow(alpha, { count: 6 }, {
      database,
      pageOpen: open,
      reader: async () => signedOut,
    })
    expect(row?.courses.map((course) => course.title)).toEqual(["Notion basics"])
    expect(row?.action).toEqual({ label: "See all courses", href: "/courses" })

    expect(
      await readCoursesRow(beta, {}, { database, pageOpen: open, reader: async () => signedOut })
    ).toBeNull()
  })

  it("leaves drafts off even for an admin", async () => {
    await createCourse(alpha, { title: "Not ready" }, database)
    const admin: Reader = {
      userId: "admin",
      rules: { signedIn: true, isAdmin: true, isPaid: false, planId: null },
      viewer: { signedIn: true, isAdmin: true, previewingAsFree: false },
    }
    expect(
      await readCoursesRow(alpha, {}, { database, pageOpen: open, reader: async () => admin })
    ).toBeNull()
  })

  it("stops at the number asked for and draws nothing when Courses is closed", async () => {
    await alphaCourse()
    for (const title of ["Two", "Three"]) {
      const course = await createCourse(alpha, { title }, database)
      await updateCourse(alpha, course.id, { status: "published" }, database)
    }
    const two = await readCoursesRow(alpha, { count: 2 }, {
      database,
      pageOpen: open,
      reader: async () => signedOut,
    })
    expect(two?.courses).toHaveLength(2)

    expect(
      await readCoursesRow(alpha, {}, {
        database,
        pageOpen: async () => false,
        reader: async () => signedOut,
      })
    ).toBeNull()
  })
})

describe("Copy courses, when an admin copies a site", () => {
  it("copies nothing unless it was ticked", async () => {
    await alphaCourse()
    await copySiteCourses({
      sourceWorkspaceId: alpha,
      newWorkspaceId: beta,
      choices: [],
      database,
    })
    expect(await listCourses(beta, database)).toEqual([])
  })

  it("copies courses, parts and chapters as drafts, and no reader's records", async () => {
    const { course, chapter, group } = await alphaCourse()
    const second = await addChapter(alpha, course.id, { title: "Second", groupId: group.id }, database)
    // A link from the second chapter to the first, as the editor writes it.
    const linkBody = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Back to the start",
              marks: [{ type: "link", attrs: { href: `/courses/to/${chapter.id}` } }],
            },
          ],
        },
      ],
    }
    await updateChapter(alpha, second.id, { body: linkBody }, database)
    const user = await insertUser(database)
    await setChapterDone(alpha, paidMember(user.id), chapter.id, true, database)
    await askQuestion(alpha, paidMember(user.id), chapter.id, "Why?", database)

    await copySiteCourses({
      sourceWorkspaceId: alpha,
      newWorkspaceId: beta,
      choices: [COPY_COURSES_CHOICE],
      database,
    })

    const [copy] = await listCourses(beta, database)
    expect(copy.title).toBe("Notion basics")
    expect(copy.id).not.toBe(course.id)
    expect(copy.status).toBe("draft")

    const outline = await loadCourseOutlineForEdit(beta, copy.id, database)
    expect(outline!.chapters.map((row) => row.title)).toEqual(
      expect.arrayContaining([chapter.title, "Second"])
    )
    expect(outline!.chapters.every((row) => row.status === "draft")).toBe(true)
    expect(outline!.groups.map((row) => row.title)).toEqual(["Part one"])
    const copiedSecond = outline!.chapters.find((row) => row.title === "Second")!
    expect(copiedSecond.groupId).toBe(outline!.groups[0].id)

    // The link points at the copy of the first chapter, on the new site.
    const copiedFirst = outline!.chapters.find((row) => row.title === chapter.title)!
    expect(JSON.stringify(copiedSecond.body)).toContain(`/courses/to/${copiedFirst.id}`)
    expect(JSON.stringify(copiedSecond.body)).not.toContain(chapter.id)

    // Readers' records stay with the original.
    expect(await database.select().from(courseChapterProgress)).toHaveLength(1)
    expect(await database.select().from(courseQuestions)).toHaveLength(1)
    // And the original is untouched.
    const [original] = await listCourses(alpha, database)
    expect(original.status).toBe("published")
  })
})
