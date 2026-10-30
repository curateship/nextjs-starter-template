import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { PERSONAL_PROJECT_ID, stepFieldsSchema } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { copyProject, loadProjectPage } from "@/server/project/projects"
import { duplicateTask, promoteStep } from "@/server/project/task-changes"
import {
  createTaskType,
  createTypeField,
  listTeamTypes,
  saveTaskAsType,
  setTaskType,
  updateTaskType,
  updateTypeField,
} from "@/server/project/task-types"
import { addStep, createTask, loadTaskDetail, updateStep } from "@/server/project/tasks"
import { insertEmployee, projectFor, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase } from "@/server/test-support"

// Misc 4, 28 Oct 2026: fields on each step, and Save as task template.

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let admin: CustomShellUser
let teamId: string
let website: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })
const link = { id: "f1", name: "Link", value: "https://dropbox.com/cut", kind: "link" as const }

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertEmployee(database, { name: "Anna", email: "anna@example.test" })
  const started = await startTeam(database, [anna])
  admin = started.admin
  teamId = started.team.id
  website = (await projectFor(admin, anna.id, { name: "Website", color: "pink", description: "" }, database)).id
})

afterEach(async () => {
  await client.close()
})

async function taskWithStep(title = "Edit the video") {
  const { id } = await createTask(
    actor(anna),
    { projectId: website, title, notes: "Use the long cut.", assigneeUserId: null, dueDate: null, steps: [] },
    database
  )
  const step = await addStep(actor(anna), { taskId: id, text: "Rough cut" }, database)
  return { id, stepId: step.id }
}

describe("a step's own fields", () => {
  it("saves a name and value on a step and reads them back", async () => {
    const { id, stepId } = await taskWithStep()
    await updateStep(actor(anna), { stepId, fields: [link] }, database)
    const detail = await loadTaskDetail(anna.id, id, database)
    expect(detail.steps).toMatchObject([{ text: "Rough cut", fields: [link] }])
  })

  it("comes along on Duplicate and Copy project, with fresh ids", async () => {
    const { id, stepId } = await taskWithStep()
    await updateStep(actor(anna), { stepId, fields: [link] }, database)

    const copy = await duplicateTask(actor(anna), id, database)
    const copied = (await loadTaskDetail(anna.id, copy.id, database)).steps[0].fields
    expect(copied).toMatchObject([{ name: "Link", value: link.value }])
    expect(copied[0].id).not.toBe(link.id)

    const project = await inTeam(teamId, () =>
      copyProject(admin.id, { projectId: website, name: "Website again" }, database)
    )
    const page = await loadProjectPage(admin.id, project.id, database)
    const fromCopy = await loadTaskDetail(admin.id, page.tasks[0].id, database)
    expect(fromCopy.steps[0].fields).toMatchObject([{ name: "Link", value: link.value }])
  })

  it("turns into the new task's notes when the step becomes a task", async () => {
    const { stepId } = await taskWithStep()
    await updateStep(actor(anna), { stepId, fields: [link, { id: "f2", name: "Length", value: "60s", kind: "text" as const }] }, database)
    const made = await promoteStep(actor(anna), stepId, database)
    const detail = await loadTaskDetail(anna.id, made.id, database)
    expect(detail.task.notes).toBe("Link: https://dropbox.com/cut\nLength: 60s")
  })
})

describe("a step field's kind", () => {
  const field = (kind: string, value: string) => [{ id: "f1", name: "Field", value, kind }]
  it("takes only what its kind can hold, and must name one", () => {
    expect(stepFieldsSchema.safeParse(field("number", "12.5")).success).toBe(true)
    expect(stepFieldsSchema.safeParse(field("number", "twelve")).success).toBe(false)
    expect(stepFieldsSchema.safeParse(field("date", "2026-10-28")).success).toBe(true)
    expect(stepFieldsSchema.safeParse(field("date", "2026-02-30")).success).toBe(false)
    expect(stepFieldsSchema.safeParse(field("tick", "yes")).success).toBe(true)
    expect(stepFieldsSchema.safeParse(field("tick", "maybe")).success).toBe(false)
    expect(stepFieldsSchema.safeParse(field("colour", "red")).success).toBe(false)
    expect(stepFieldsSchema.safeParse([{ id: "f1", name: "Old", value: "x" }]).success).toBe(false)
  })

  it("reads as words when the step becomes a task", async () => {
    const { stepId } = await taskWithStep()
    await updateStep(
      actor(anna),
      {
        stepId,
        fields: [
          { id: "a", name: "Cut", value: "dropbox.com/cut", kind: "link" },
          { id: "b", name: "Approved", value: "yes", kind: "tick" },
        ],
      },
      database
    )
    const made = await promoteStep(actor(anna), stepId, database)
    expect((await loadTaskDetail(anna.id, made.id, database)).task.notes).toBe(
      "Cut: https://dropbox.com/cut\nApproved: Yes"
    )
  })
})

describe("Save as task template", () => {
  it("keeps the task's steps with their fields, its notes, and its template's fields", async () => {
    await inTeam(teamId, async () => {
      const video = await createTaskType(admin.id, { name: "Video", icon: "video", color: "red" }, database)
      const platform = await createTypeField(admin.id, { typeId: video.id, name: "Platform", kind: "dropdown" }, database)
      await updateTypeField(admin.id, { fieldId: platform.id, choices: [{ name: "YouTube" }] }, database)
      const choiceId = (await listTeamTypes(teamId, database))[0].fields[0].settings.choices![0].id
      const url = await createTypeField(admin.id, { typeId: video.id, name: "Video link", kind: "text" }, database)
      await updateTypeField(admin.id, { fieldId: url.id, showWhen: { fieldId: platform.id, choiceId } }, database)

      const { id, stepId } = await taskWithStep()
      await setTaskType(actor(anna), { taskId: id, typeId: video.id }, database)
      await updateStep(actor(anna), { stepId, fields: [link] }, database)

      const saved = await saveTaskAsType(admin.id, { taskId: id, name: "Edit a video" }, database)
      const template = (await listTeamTypes(teamId, database)).find((type) => type.id === saved.id)!
      expect(template).toMatchObject({ name: "Edit a video", icon: "video", color: "red", steps: ["Rough cut"] })
      expect(template.notes).toBe("Use the long cut.")
      expect(template.fields.map((field) => field.name)).toEqual(["Platform", "Video link"])
      // "Show only when" points at the copy of Platform, not the old one.
      expect(template.fields[1].settings.showWhen).toEqual({ fieldId: template.fields[0].id, choiceId })

      // A new task from the template gets the step and its fields.
      const made = await createTask(
        actor(anna),
        {
          projectId: website,
          title: "Next video",
          notes: "",
          assigneeUserId: null,
          dueDate: null,
          steps: ["Rough cut", "Typed by hand"],
          typeId: saved.id,
        },
        database
      )
      const steps = (await loadTaskDetail(anna.id, made.id, database)).steps
      expect(steps.map((step) => [step.text, step.fields.map((field) => field.name)])).toEqual([
        ["Rough cut", ["Link"]],
        ["Typed by hand", []],
      ])

      // Taking the step off the template takes its fields too.
      await updateTaskType(admin.id, { typeId: saved.id, steps: [] }, database)
      await updateTaskType(admin.id, { typeId: saved.id, steps: ["Rough cut"] }, database)
      const again = await createTask(
        actor(anna),
        { projectId: website, title: "Third", notes: "", assigneeUserId: null, dueDate: null, steps: ["Rough cut"], typeId: saved.id },
        database
      )
      expect((await loadTaskDetail(anna.id, again.id, database)).steps[0].fields).toEqual([])
    })
  })

  it("is refused to someone who doesn't run the team, and for a name the team already has", async () => {
    await inTeam(teamId, async () => {
      const { id } = await taskWithStep()
      await expect(saveTaskAsType(anna.id, { taskId: id, name: "Mine" }, database)).rejects.toThrow(
        PROJECT_ERRORS.notRunningTeam
      )
      await createTaskType(admin.id, { name: "Video", icon: "video", color: "red" }, database)
      await expect(saveTaskAsType(admin.id, { taskId: id, name: "video" }, database)).rejects.toThrow(
        PROJECT_ERRORS.typeNameTaken
      )
      expect((await loadTaskDetail(anna.id, id, database)).canSaveTemplate).toBe(false)
      expect((await loadTaskDetail(admin.id, id, database)).canSaveTemplate).toBe(true)
    })
  })

  it("is refused on a Just me task, whose team shows its templates nowhere", async () => {
    const { id } = await createTask(
      actor(admin),
      { projectId: PERSONAL_PROJECT_ID, title: "Send the contract", notes: "", assigneeUserId: admin.id, dueDate: null, steps: [] },
      database
    )
    expect((await loadTaskDetail(admin.id, id, database)).canSaveTemplate).toBe(false)
    await expect(saveTaskAsType(admin.id, { taskId: id, name: "Contracts" }, database)).rejects.toThrow(
      PROJECT_ERRORS.personalProject
    )
  })
})
