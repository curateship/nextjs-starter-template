import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { overDoingLimit } from "@/lib/project/doing-limit"
import type { DayMeeting } from "@/lib/project/meetings"
import { openView, viewHasFilters } from "@/lib/project/saved-views"
import { NOBODY_FILTER } from "@/lib/project/task-filters"
import { dayBlocks, weekDays, weekHours } from "@/lib/project/week-view"
import type { CustomShellDb } from "@/server/db"
import { requireMembership, inTeam } from "@/server/project/access"
import { saveFinishedDays } from "@/server/project/checkin-jobs"
import { submitCheckin } from "@/server/project/checkins"
import { loadTeamActivity } from "@/server/project/project-activity"
import {
  addProjectMember,
  loadProjectPage,
  removeProjectMember,
} from "@/server/project/projects"
import { deleteView, listSavedViews, saveView, updateView } from "@/server/project/saved-views"
import { projectTasks } from "@/server/project/schema"
import { searchTasks } from "@/server/project/search"
import { assignTask, createTask, deleteTask, setTaskStatus, updateTask } from "@/server/project/tasks"
import { loadTeamFigures, loadTeamTrends } from "@/server/project/team-figures"
import { loadTeamMonth } from "@/server/project/team-days"
import { removeTeamMember } from "@/server/project/teams"
import { insertEmployee, projectFor, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase } from "@/server/test-support"
import type { TaskActivityEntry } from "@/server/project/project-activity"

/*
 * More features task 04: search every project, saved views, the team's
 * Activity tab, the Team calendar's week and the 12 weeks of trends.
 *
 * The site admin runs the team; Anna, Ben and Carla are its employees.
 * "Website" has Anna and Ben, "Secret" only Anna. Dates are in 2099 so nothing meets the real today;
 * 2 March 2099 is a Monday.
 */

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let admin: CustomShellUser
let adminTeamId: string
let website: string
let secret: string

const at = (iso: string) => new Date(iso)

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertEmployee(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertEmployee(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertEmployee(database, { name: "Carla", email: "carla@example.test" })
  const started = await startTeam(database, [anna, ben, carla])
  admin = started.admin
  adminTeamId = started.team.id
  website = (await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)).id
  await addProjectMember(admin.id, website, ben.id, database)
  secret = (await projectFor(admin, anna.id, { name: "Secret", color: "red", description: "" }, database)).id
})

afterEach(async () => {
  await client.close()
})

const task = (who: CustomShellUser, projectId: string, title: string, notes = "") =>
  createTask(
    who,
    { projectId, title, notes, assigneeUserId: null, dueDate: null, steps: [] },
    database
  ).then((made) => made.id)

const titles = (hits: { title: string }[]) => hits.map((hit) => hit.title).sort()

describe("searching every project", () => {
  it("finds titles and notes across the projects a person can see, and nothing else", async () => {
    await task(anna, website, "New logo for the homepage")
    await task(anna, website, "Fonts", "Match the logo's weight")
    await task(anna, secret, "Logo for the surprise")
    await task(ben, "personal", "Sketch a logo idea")
    await task(carla, "personal", "Carla's logo notes")

    // Ben is on Website and has his own Just me list; Secret and Carla's list are hidden.
    expect(titles(await searchTasks(ben.id, "logo", database))).toEqual([
      "Fonts",
      "New logo for the homepage",
      "Sketch a logo idea",
    ])
    // Anna is on both shared projects, but never sees someone else's Just me list.
    expect(titles(await searchTasks(anna.id, "LOGO", database))).toEqual([
      "Fonts",
      "Logo for the surprise",
      "New logo for the homepage",
    ])
    // The site admin sees every project, everyone's Just me list included.
    expect(titles(await searchTasks(admin.id, "logo", database))).toEqual([
      "Carla's logo notes",
      "Fonts",
      "Logo for the surprise",
      "New logo for the homepage",
      "Sketch a logo idea",
    ])
    // Every word must be there, in the title or the notes.
    expect(titles(await searchTasks(ben.id, "logo weight", database))).toEqual(["Fonts"])
    expect(await searchTasks(ben.id, "   ", database)).toEqual([])
  })

  it("puts a title match first and names the project", async () => {
    await task(anna, website, "Fonts", "Match the logo's weight")
    await task(anna, website, "Logo files")
    const hits = await searchTasks(ben.id, "logo", database)
    expect(hits[0]).toMatchObject({ title: "Logo files", status: "todo", project: { name: "Website", personal: false } })
  })

  it("leaves out the bin, and words that are only in a link to another task", async () => {
    const binned = await task(anna, website, "Old logo")
    await deleteTask(anna, binned, database)
    const secretTask = await task(anna, secret, "Hidden rebrand")
    const notes = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "text", text: "Hidden rebrand", marks: [{ type: "link", attrs: { href: `/projects/x?task=${secretTask}` } }] },
          ],
        },
      ],
    })
    await task(anna, website, "Brief", notes)
    expect(await searchTasks(ben.id, "logo", database)).toEqual([])
    // "rebrand" sits only in a link to a task Ben can't see.
    expect(await searchTasks(ben.id, "rebrand", database)).toEqual([])
    // Markup words in the saved document aren't the notes' words.
    expect(await searchTasks(ben.id, "paragraph", database)).toEqual([])
  })
})

describe("saved views", () => {
  it("are the person's own, per project and on My tasks", async () => {
    const label = { status: "stuck" as const, person: ben.id }
    const view = await saveView(anna.id, { projectId: website, name: "Ben's stuck tasks", filters: label }, database)
    expect(view).toMatchObject({ name: "Ben's stuck tasks", filters: label, names: { person: "Ben" } })
    await saveView(anna.id, { projectId: null, name: "Stuck", filters: { status: "stuck", person: ben.id } }, database)

    const page = await loadProjectPage(anna.id, website, database)
    expect(page.views.map((v) => v.name)).toEqual(["Ben's stuck tasks"])
    // My tasks has no Person filter, so it isn't saved there.
    const [mine] = await listSavedViews(anna.id, await teamId(), null, database)
    expect(mine.filters).toEqual({ status: "stuck" })
    // Ben sees none of Anna's, and can't delete them.
    expect((await loadProjectPage(ben.id, website, database)).views).toEqual([])
    await expect(deleteView(ben.id, view.id, database)).rejects.toThrow(PROJECT_ERRORS.viewNotFound)
    await deleteView(anna.id, view.id, database)
    expect((await loadProjectPage(anna.id, website, database)).views).toEqual([])
  })

  it("refuses an empty view and a project the person can't see", async () => {
    await expect(
      saveView(anna.id, { projectId: website, name: "Nothing", filters: { q: "  " } }, database)
    ).rejects.toThrow(PROJECT_ERRORS.viewNeedsFilters)
    await expect(
      saveView(ben.id, { projectId: secret, name: "Peek", filters: { status: "todo" } }, database)
    ).rejects.toThrow(PROJECT_ERRORS.projectNotFound)
  })

  it("keep a group, and a group alone is a view (Tyler: \"sorting is also a filter\")", async () => {
    expect(viewHasFilters({ group: "priority" })).toBe(true)
    expect(viewHasFilters({ group: "none" })).toBe(false)

    const view = await saveView(anna.id, { projectId: website, name: "By priority", filters: { group: "priority" } }, database)
    expect(view.filters).toEqual({ group: "priority" })
    const [listed] = (await loadProjectPage(anna.id, website, database)).views
    expect(listed.filters).toEqual({ group: "priority" })
    expect(openView(listed, { labels: [], types: [] }, NOBODY_FILTER).filters).toEqual({ group: "priority" })

    // "None" isn't kept, so it alone is an empty view.
    await expect(
      saveView(anna.id, { projectId: website, name: "Nothing", filters: { group: "none" } }, database)
    ).rejects.toThrow(PROJECT_ERRORS.viewNeedsFilters)
    // My tasks has no Group row, so a group alone is nothing there.
    await expect(
      saveView(anna.id, { projectId: null, name: "By priority", filters: { group: "priority" } }, database)
    ).rejects.toThrow(PROJECT_ERRORS.viewNeedsFilters)
    const mine = await saveView(anna.id, { projectId: null, name: "Doing", filters: { status: "doing", group: "priority" } }, database)
    expect(mine.filters).toEqual({ status: "doing" })
  })

  it("are renamed and refiltered by their person only, where they were saved", async () => {
    const view = await saveView(anna.id, { projectId: website, name: "Stuck", filters: { status: "stuck" } }, database)
    const edited = await updateView(
      anna.id,
      { viewId: view.id, name: "Ben's by priority", filters: { person: ben.id, group: "priority" } },
      database
    )
    expect(edited).toEqual({
      id: view.id,
      name: "Ben's by priority",
      filters: { person: ben.id, group: "priority" },
      names: { person: "Ben" },
    })
    expect((await loadProjectPage(anna.id, website, database)).views).toEqual([edited])

    // Nothing left to show is refused, and the view is as it was.
    await expect(
      updateView(anna.id, { viewId: view.id, name: "Empty", filters: { group: "none" } }, database)
    ).rejects.toThrow(PROJECT_ERRORS.viewNeedsFilters)
    // Someone else's view isn't there for them.
    await expect(
      updateView(ben.id, { viewId: view.id, name: "Mine now", filters: { status: "todo" } }, database)
    ).rejects.toThrow(PROJECT_ERRORS.viewNotFound)
    expect((await loadProjectPage(anna.id, website, database)).views).toEqual([edited])

    // On My tasks a view keeps no person or group.
    const mine = await saveView(anna.id, { projectId: null, name: "Doing", filters: { status: "doing" } }, database)
    expect(
      (await updateView(anna.id, { viewId: mine.id, name: "Done", filters: { status: "done", person: ben.id, group: "tags" } }, database))
        .filters
    ).toEqual({ status: "done" })
  })

  it("go when their person leaves the project or the team", async () => {
    await inTeam(adminTeamId, async () => {
      await saveView(ben.id, { projectId: website, name: "Mine", filters: { person: ben.id } }, database)
      await saveView(ben.id, { projectId: null, name: "Doing", filters: { status: "doing" } }, database)
      await removeProjectMember(admin.id, website, ben.id, database)
      const team = await teamId()
      expect(await listSavedViews(ben.id, team, website, database)).toEqual([])
      expect(await listSavedViews(ben.id, team, null, database)).toHaveLength(1)
      await removeTeamMember(admin.id, ben.id, database)
      expect(await listSavedViews(ben.id, team, null, database)).toEqual([])
    })
  })

  it("open without a person no longer on the project or a deleted label, and say so", () => {
    const view = {
      filters: { status: "stuck" as const, person: "leo", label: "gone" },
      names: { person: "Leo", label: "Bug" },
    }
    const here = { people: [{ id: "ben" }], labels: [{ id: "l1" }], types: [] }
    expect(openView(view, here, NOBODY_FILTER)).toEqual({
      filters: { status: "stuck" },
      missing: ["Leo isn't on this project any more", 'The tag "Bug" was deleted'],
    })
    // "Nobody assigned" is always there.
    expect(openView({ filters: { person: NOBODY_FILTER }, names: {} }, here, NOBODY_FILTER).missing).toEqual([])
  })
})

async function teamId() {
  return (await requireMembership(anna.id, database)).teamId
}

describe("the team's Activity tab", () => {
  it("lists every project the viewer can see, naming each, and never Just me or the bin", async () => {
    const logo = await task(anna, website, "Logo")
    await task(anna, secret, "Surprise")
    await task(ben, "personal", "Dentist")
    const binned = await task(anna, website, "Old page")
    await deleteTask(anna, binned, database)
    await setTaskStatus(ben, { taskId: logo, status: "doing", stuckReason: null }, database)

    const forBen = await loadTeamActivity(ben.id, {}, database)
    expect((forBen.entries as TaskActivityEntry[]).map((entry) => [entry.task.title, entry.kind, entry.project.name])).toEqual([
      ["Logo", "status_changed", "Website"],
      ["Logo", "created", "Website"],
    ])
    const forAnna = await loadTeamActivity(anna.id, {}, database)
    expect(new Set((forAnna.entries as TaskActivityEntry[]).map((entry) => entry.task.title))).toEqual(new Set(["Logo", "Surprise"]))
    // Carla is on no project.
    expect((await loadTeamActivity(carla.id, {}, database)).entries).toEqual([])
  })

  it("pages 50 at a time", async () => {
    for (let n = 0; n < 26; n += 1) {
      const id = await task(anna, website, `Task ${n}`)
      await setTaskStatus(anna, { taskId: id, status: "doing", stuckReason: null }, database)
    }
    const first = await loadTeamActivity(anna.id, {}, database)
    expect(first.entries).toHaveLength(50)
    expect(first.more).toBe(true)
    const last = first.entries[first.entries.length - 1]
    const second = await loadTeamActivity(anna.id, { before: { at: last.at, id: last.id } }, database)
    expect(second.entries).toHaveLength(2)
    expect(second.more).toBe(false)
  })
})

describe("the Team calendar's week", () => {
  it("covers the whole grid, so a week crossing into the next month has its counts", async () => {
    // Fri 27 Feb to Mon 2 Mar 2099: the March grid starts on Mon 23 Feb.
    await submitCheckin(anna.id, { answers: [], picks: [] }, database, at("2099-02-27T08:55:00Z"))
    await saveFinishedDays(database, at("2099-02-28T00:00:30Z"))
    const march = await loadTeamMonth(anna.id, "2099-03", database, at("2099-03-03T10:00:00Z"))
    expect(march.days.find((day) => day.day === "2099-02-27")).toMatchObject({ checkedIn: 1, expected: 3 })
  })

  it("runs Monday to Sunday and draws meetings at their times on the viewer's day", () => {
    expect(weekDays("2099-03-04")).toEqual([
      "2099-03-02",
      "2099-03-03",
      "2099-03-04",
      "2099-03-05",
      "2099-03-06",
      "2099-03-07",
      "2099-03-08",
    ])
    const meeting = (id: string, startsAt: string, endsAt: string, day: string): DayMeeting =>
      ({ occurrence: { meetingId: id, day, startsAt, endsAt }, meeting: { id } }) as DayMeeting
    // 10:00 to 11:00 and 10:30 to 11:30 share the width; 22:30 in Toronto is the next day in Tokyo.
    const blocks = dayBlocks(
      [
        meeting("a", "2099-03-04T10:00:00Z", "2099-03-04T11:00:00Z", "2099-03-04"),
        meeting("b", "2099-03-04T10:30:00Z", "2099-03-04T11:30:00Z", "2099-03-04"),
        meeting("c", "2099-03-04T14:00:00Z", "2099-03-04T14:10:00Z", "2099-03-04"),
      ],
      "UTC"
    )
    expect(blocks.map((b) => [b.meeting.id, b.start, b.end, b.slot, b.slots])).toEqual([
      ["a", 600, 660, 0, 2],
      ["b", 630, 690, 1, 2],
      ["c", 840, 860, 0, 1],
    ])
    // A meeting past midnight is cut at the end of the viewer's day.
    const late = dayBlocks([meeting("d", "2099-03-04T23:30:00Z", "2099-03-05T00:30:00Z", "2099-03-04")], "UTC")
    expect([late[0].start, late[0].end]).toEqual([1410, 1440])
    expect(weekHours(late)).toEqual({ first: 8, last: 24 })
    expect(weekHours([])).toEqual({ first: 8, last: 18 })
  })
})

describe("team trends", () => {
  it("counts 12 weeks the way the figures do, with this week's finished equal to Completed", async () => {
    const wednesday = at("2099-03-04T10:00:00Z")
    const ids = await Promise.all(["A", "B", "C"].map((title) => task(anna, website, title)))
    for (const id of ids) await setTaskStatus(anna, { taskId: id, status: "done", stuckReason: null }, database)
    // One finished this week, one last week, one in a project Ben can't see.
    await database.update(projectTasks).set({ completedAt: at("2099-03-03T12:00:00Z") }).where(eq(projectTasks.id, ids[0]))
    await database.update(projectTasks).set({ completedAt: at("2099-02-25T12:00:00Z") }).where(eq(projectTasks.id, ids[1]))
    await database
      .update(projectTasks)
      .set({ completedAt: at("2099-03-02T12:00:00Z"), projectId: secret })
      .where(eq(projectTasks.id, ids[2]))

    // Monday: Anna and Ben check in, Carla doesn't. Tuesday: only Anna.
    await submitCheckin(anna.id, { answers: [], picks: [] }, database, at("2099-03-02T08:55:00Z"))
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at("2099-03-02T09:30:00Z"))
    await saveFinishedDays(database, at("2099-03-03T00:00:30Z"))
    await submitCheckin(anna.id, { answers: [], picks: [] }, database, at("2099-03-03T08:55:00Z"))
    await saveFinishedDays(database, at("2099-03-04T00:00:30Z"))

    const weeks = await loadTeamTrends(ben.id, database, wednesday)
    expect(weeks).toHaveLength(12)
    expect(weeks[0].monday).toBe("2098-12-15")
    const [lastWeek, thisWeek] = weeks.slice(-2)
    expect(thisWeek).toEqual({ monday: "2099-03-02", checkins: { checkedIn: 3, expected: 6 }, finished: 1 })
    expect(lastWeek.finished).toBe(1)
    expect(thisWeek.finished).toBe((await loadTeamFigures(ben.id, database, wednesday)).completedThisWeek)
    // Anna is on Secret, so she sees it too.
    expect((await loadTeamTrends(anna.id, database, wednesday)).at(-1)?.finished).toBe(2)
  })

  it("never splits by person", async () => {
    const weeks = await loadTeamTrends(anna.id, database, at("2099-03-04T10:00:00Z"))
    expect(Object.keys(weeks[0]).sort()).toEqual(["checkins", "finished", "monday"])
  })
})

describe("the Board grouped by person", () => {
  it("knows whose row a Doing warning belongs in", () => {
    const leo = { id: "leo", name: "Leo" }
    const doing = Array.from({ length: 2 }, () => ({ status: "doing", assignee: leo }))
    expect(overDoingLimit(doing, 1)).toEqual([{ personId: "leo", text: "Leo has 2 in Doing (limit 1)" }])
  })

  it("hands over by the picker's rule: only to someone on the project", async () => {
    const id = await task(anna, website, "Logo")
    // Carla isn't on Website, so a drop into a row of hers would be refused.
    await expect(
      assignTask(anna, { taskId: id, assigneeUserId: carla.id, note: null }, database)
    ).rejects.toThrow(PROJECT_ERRORS.notProjectMember)
    await assignTask(anna, { taskId: id, assigneeUserId: ben.id, note: null }, database)
    const [row] = await database.select().from(projectTasks).where(eq(projectTasks.id, id))
    expect(row.assigneeUserId).toBe(ben.id)
  })
})

describe("the Calendar tab", () => {
  it("saves a dropped day as the due date, the same change as the picker", async () => {
    const id = await task(anna, website, "Logo")
    await updateTask(anna, { taskId: id, dueDate: "2099-03-05" }, database)
    const page = await loadProjectPage(ben.id, website, database)
    expect(page.tasks.find((card) => card.id === id)?.dueDate).toBe("2099-03-05")
  })
})
