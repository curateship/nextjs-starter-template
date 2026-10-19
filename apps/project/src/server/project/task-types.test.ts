import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { setRepeat } from "@/server/project/planning"
import { makeRepeatCopies } from "@/server/project/planning-jobs"
import {
  addProjectMember,
  copyProject,
  loadProjectPage,
  removeProjectMember,
} from "@/server/project/projects"
import { projectTaskTypeFields, projectTasks } from "@/server/project/schema"
import {
  changeManyTasks,
  createTasksFromLines,
  duplicateTask,
  moveTask,
} from "@/server/project/task-changes"
import { addTaskFile, listTaskFiles, type FileStorage } from "@/server/project/task-files"
import {
  archiveTaskType,
  createTaskType,
  createTypeField,
  deleteTypeField,
  listTeamTypes,
  setProjectTypes,
  setTaskFieldValue,
  setTaskType,
  updateTaskType,
  updateTypeField,
} from "@/server/project/task-types"
import { assignTask, createTask, loadTaskDetail, setTaskStatus } from "@/server/project/tasks"
import { projectFor, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let admin: CustomShellUser
let website: string
let shop: string
let teamId: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  const started = await startTeam(database, [anna, ben, carla])
  teamId = started.team.id
  admin = started.admin
  // A project's members are the site admin's to change.
  website = (await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)).id
  await addProjectMember(admin.id, website, ben.id, database)
  shop = (await projectFor(admin, anna.id, { name: "Shop", color: "green", description: "" }, database)).id
  await addProjectMember(admin.id, shop, carla.id, database)
})

afterEach(async () => {
  await client.close()
})

/**
 * Leo's "Video editing" from the task file, set up by the site admin, whose
 * task types are theirs alone: a Footage link only whoever handed it out may
 * change, filled when made; a Platform dropdown; a
 * Thumbnail shown only for YouTube and needed before Done; and a Final cut
 * file needed before Done.
 */
async function videoEditing() {
  const { id: typeId } = await inTeam(teamId, () =>
    createTaskType(admin.id, { name: "Video editing", icon: "video", color: "red" }, database)
  )
  const field = async (name: string, kind: Parameters<typeof createTypeField>[1]["kind"]) =>
    (await createTypeField(admin.id, { typeId, name, kind }, database)).id
  const footage = await field("Footage link", "link")
  const platform = await field("Platform", "dropdown")
  const thumbnail = await field("Thumbnail", "text")
  const finalCut = await field("Final cut", "file")
  const editor = await field("Editor", "person")
  await updateTypeField(
    admin.id,
    { fieldId: platform, choices: [{ name: "YouTube" }, { name: "TikTok" }, { name: "Instagram" }] },
    database
  )
  const choices = (await listTeamTypes(teamId, database))[0].fields.find((f) => f.id === platform)!.settings
    .choices!
  const youtube = choices.find((c) => c.name === "YouTube")!.id
  const tiktok = choices.find((c) => c.name === "TikTok")!.id
  await updateTypeField(admin.id, { fieldId: footage, neededWhenMade: true, whoCanChange: "handed_out_by" }, database)
  await updateTypeField(
    admin.id,
    { fieldId: thumbnail, neededBeforeDone: true, showWhen: { fieldId: platform, choiceId: youtube } },
    database
  )
  await updateTypeField(admin.id, { fieldId: finalCut, neededBeforeDone: true }, database)
  return { typeId, footage, platform, thumbnail, finalCut, editor, youtube, tiktok }
}

async function plainTask(title: string, projectId = website) {
  return (
    await createTask(
      actor(anna),
      { projectId, title, notes: "", assigneeUserId: null, dueDate: null, steps: [] },
      database
    )
  ).id
}

async function videoTask(t: Awaited<ReturnType<typeof videoEditing>>, title = "Edit the trailer") {
  return (
    await createTask(
      actor(anna),
      {
        projectId: website,
        title,
        notes: "",
        assigneeUserId: ben.id,
        dueDate: null,
        steps: [],
        typeId: t.typeId,
        fieldValues: { [t.footage]: "https://drive.example.test/raw" },
      },
      database
    )
  ).id
}

function memoryStorage() {
  const stored = new Map<string, Uint8Array>()
  const storage: FileStorage = {
    put: async (path, data) => {
      stored.set(path, data)
    },
    remove: async (path) => {
      stored.delete(path)
    },
  }
  return { stored, storage }
}

const card = async (taskId: string, userId = anna.id, projectId = website) =>
  (await loadProjectPage(userId, projectId, database)).tasks.find((t) => t.id === taskId)!

describe("task types for the team", () => {
  it("lets only the site admin make and change them", async () => {
    for (const person of [ben, anna]) {
      await expect(
        createTaskType(person.id, { name: "Research", icon: "search", color: "blue" }, database)
      ).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    }
    // The site admin is on no team, so the Task types page names the one it shows.
    await expect(createTaskType(admin.id, { name: "Research", icon: "search", color: "blue" }, database)).rejects.toThrow(
      PROJECT_ERRORS.noTeamNamed
    )
    await inTeam(teamId, () => createTaskType(admin.id, { name: "Research", icon: "search", color: "blue" }, database))
    await expect(
      inTeam(teamId, () => createTaskType(admin.id, { name: "research", icon: "book", color: "teal" }, database))
    ).rejects.toThrow(
      PROJECT_ERRORS.typeNameTaken
    )
  })

  it("leaves a task with no type a plain task with no chip", async () => {
    await videoEditing()
    const taskId = await plainTask("Fonts")
    expect((await card(taskId)).type).toBeNull()
    expect((await card(taskId)).fieldValues).toEqual({})
  })

  it("archives a type: it leaves New task, and its tasks keep the type and values", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await archiveTaskType(admin.id, { typeId: t.typeId, archived: true }, database)
    expect((await card(taskId)).type?.name).toBe("Video editing")
    expect((await card(taskId)).fieldValues[t.footage]).toBe("https://drive.example.test/raw")
    await expect(videoTask(t, "Another")).rejects.toThrow(PROJECT_ERRORS.typeArchived)
    const detail = await loadTaskDetail(ben.id, taskId, database)
    expect(detail.fields.typeChoices.map((c) => [c.name, c.archived])).toEqual([["Video editing", true]])
  })
})

describe("fields for each type", () => {
  it("shows a task's values on its card and saves a field when it is filled", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await setTaskFieldValue(actor(ben), { taskId, fieldId: t.platform, value: t.tiktok }, database)
    expect((await card(taskId)).fieldValues).toEqual({
      [t.footage]: "https://drive.example.test/raw",
      [t.platform]: t.tiktok,
    })
    // Emptying a field takes its value away.
    await setTaskFieldValue(actor(ben), { taskId, fieldId: t.platform, value: null }, database)
    expect((await card(taskId)).fieldValues[t.platform]).toBeUndefined()
  })

  it("refuses values that don't fit: a link that isn't https, a choice that isn't one, someone off the project", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await expect(
      setTaskFieldValue(actor(anna), { taskId, fieldId: t.footage, value: "javascript:alert(1)" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.fieldLink)
    await expect(
      setTaskFieldValue(actor(ben), { taskId, fieldId: t.platform, value: "nope" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.choiceNotFound)
    await expect(
      setTaskFieldValue(actor(ben), { taskId, fieldId: t.editor, value: carla.id }, database)
    ).rejects.toThrow(PROJECT_ERRORS.fieldPersonNotOnProject)
  })

  it("fixes a field's kind once a task has a value in it", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await setTaskFieldValue(actor(ben), { taskId, fieldId: t.thumbnail, value: "Big red arrow" }, database)
    await expect(updateTypeField(admin.id, { fieldId: t.thumbnail, kind: "number" }, database)).rejects.toThrow(
      PROJECT_ERRORS.fieldKindLocked
    )
    expect((await listTeamTypes(teamId, database, { withUse: true }))[0].fields.find((f) => f.id === t.thumbnail)?.inUse).toBe(1)
  })

  it("keeps a removed choice on the tasks that picked it, marked removed, and the field that depended on it then always shows", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await setTaskFieldValue(actor(ben), { taskId, fieldId: t.platform, value: t.youtube }, database)
    const [tiktok, instagram] = (await listTeamTypes(teamId, database))[0].fields
      .find((f) => f.id === t.platform)!
      .settings.choices!.filter((c) => c.name !== "YouTube")
    await updateTypeField(admin.id, { fieldId: t.platform, choices: [tiktok, instagram] }, database)
    const fields = (await listTeamTypes(teamId, database))[0].fields
    expect(fields.find((f) => f.id === t.platform)!.settings.choices!.find((c) => c.id === t.youtube)).toMatchObject({
      name: "YouTube",
      removed: true,
    })
    expect((await card(taskId)).fieldValues[t.platform]).toBe(t.youtube)
    expect(fields.find((f) => f.id === t.thumbnail)!.settings.showWhen ?? null).toBeNull()
  })

  it("removes a field with its values, and its files leave storage first", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    const { stored, storage } = memoryStorage()
    await addTaskFile(
      actor(ben),
      { taskId, name: "cut.mp4", mimeType: "video/mp4", data: new Uint8Array(5).fill(1), fieldId: t.finalCut },
      database,
      storage
    )
    expect(stored.size).toBe(1)
    await deleteTypeField(admin.id, t.finalCut, database, storage)
    expect(stored.size).toBe(0)
    expect(await database.select().from(projectTaskTypeFields).where(eq(projectTaskTypeFields.id, t.finalCut))).toEqual([])
  })

  it("carries the type and values on Duplicate and repeat copies, and keeps them on a move", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await setTaskFieldValue(actor(ben), { taskId, fieldId: t.editor, value: ben.id }, database)

    const { id: copyId } = await duplicateTask(actor(anna), taskId, database)
    expect((await card(copyId)).type?.id).toBe(t.typeId)
    expect((await card(copyId)).fieldValues[t.editor]).toBe(ben.id)

    await setRepeat(actor(anna), { taskId, repeat: { every: "workday" } }, database)
    await database
      .update(projectTasks)
      .set({ createdAt: new Date("2099-03-01T10:00:00Z"), status: "done" })
      .where(eq(projectTasks.id, taskId))
    await makeRepeatCopies(database, new Date("2099-03-03T00:00:30Z"))
    const repeat = (await loadProjectPage(anna.id, website, database)).tasks.find(
      (task) => task.id !== taskId && task.id !== copyId
    )!
    expect(repeat.fieldValues[t.footage]).toBe("https://drive.example.test/raw")

    // Ben isn't on Shop, so the Editor field empties, the same as the person assigned.
    await moveTask(actor(anna), { taskId: copyId, projectId: shop }, database)
    const moved = await card(copyId, anna.id, shop)
    expect(moved.type?.id).toBe(t.typeId)
    expect(moved.fieldValues[t.footage]).toBe("https://drive.example.test/raw")
    expect(moved.fieldValues[t.editor]).toBeUndefined()
  })

  it("empties a Person field when that person leaves the project", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await setTaskFieldValue(actor(anna), { taskId, fieldId: t.editor, value: ben.id }, database)
    await removeProjectMember(admin.id, website, ben.id, database)
    expect((await card(taskId)).fieldValues[t.editor]).toBeUndefined()
  })

  it("copies types and values with Copy project, leaving Person fields empty since nobody is on the copy yet", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await setTaskFieldValue(actor(anna), { taskId, fieldId: t.editor, value: ben.id }, database)
    const { id } = await copyProject(admin.id, { projectId: website, name: "Website 2" }, database)
    const [copied] = (await loadProjectPage(admin.id, id, database)).tasks
    expect(copied.type?.id).toBe(t.typeId)
    expect(copied.fieldValues[t.footage]).toBe("https://drive.example.test/raw")
    expect(copied.fieldValues[t.editor]).toBeUndefined()
  })
})

describe("needed before Done", () => {
  it("refuses Done naming the first empty field, and a file in the field counts", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await expect(
      setTaskStatus(actor(ben), { taskId, status: "done", stuckReason: null }, database)
    ).rejects.toThrow("Fill in Final cut first.")
    const { storage } = memoryStorage()
    await addTaskFile(
      actor(ben),
      { taskId, name: "cut.mp4", mimeType: "video/mp4", data: new Uint8Array(5).fill(1), fieldId: t.finalCut },
      database,
      storage
    )
    // The file sits in its field, not on the Files card.
    expect(await listTaskFiles({ userId: ben.id, role: "member" }, taskId, false, database)).toEqual([])
    await setTaskStatus(actor(ben), { taskId, status: "done", stuckReason: null }, database)
    expect((await card(taskId)).status).toBe("done")
  })

  it("needs a field hidden by Show only when only while it shows", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await updateTypeField(admin.id, { fieldId: t.finalCut, neededBeforeDone: false }, database)
    await setTaskFieldValue(actor(ben), { taskId, fieldId: t.platform, value: t.youtube }, database)
    await expect(
      setTaskStatus(actor(ben), { taskId, status: "done", stuckReason: null }, database)
    ).rejects.toThrow("Fill in Thumbnail first.")
    await setTaskFieldValue(actor(ben), { taskId, fieldId: t.platform, value: t.tiktok }, database)
    await setTaskStatus(actor(ben), { taskId, status: "done", stuckReason: null }, database)
  })

  it("leaves a task already Done alone when a field is switched to needed later", async () => {
    const t = await videoEditing()
    await updateTypeField(admin.id, { fieldId: t.finalCut, neededBeforeDone: false }, database)
    const taskId = await videoTask(t)
    await setTaskStatus(actor(ben), { taskId, status: "done", stuckReason: null }, database)
    await updateTypeField(admin.id, { fieldId: t.finalCut, neededBeforeDone: true }, database)
    expect((await card(taskId)).status).toBe("done")
    await setTaskStatus(actor(ben), { taskId, status: "done", stuckReason: null }, database)
  })

  it("refuses that task alone when ticked rows are marked Done together", async () => {
    const t = await videoEditing()
    const typed = await videoTask(t)
    const plain = await plainTask("Fonts")
    const outcome = await changeManyTasks(
      actor(anna),
      { taskIds: [typed, plain], change: { kind: "status", status: "done", stuckReason: null } },
      database
    )
    expect(outcome.changed).toEqual([plain])
    expect(outcome.refused).toEqual([{ taskId: typed, title: "Edit the trailer", reason: "Fill in Final cut first." }])
  })
})

describe("needed when made", () => {
  it("refuses New task without them, naming the first one missing", async () => {
    const t = await videoEditing()
    await expect(
      createTask(
        actor(anna),
        { projectId: website, title: "Edit", notes: "", assigneeUserId: null, dueDate: null, steps: [], typeId: t.typeId },
        database
      )
    ).rejects.toThrow("Fill in Footage link first.")
  })

  it("lets Paste a list make tasks with no type, so nothing is checked", async () => {
    await videoEditing()
    const { ids } = await createTasksFromLines(
      actor(anna),
      { projectId: website, titles: ["One", "Two"], assigneeUserId: null, dueDate: null },
      database
    )
    expect((await card(ids[0])).type).toBeNull()
  })

  it("won't let a File field be needed when made", async () => {
    const t = await videoEditing()
    await expect(updateTypeField(admin.id, { fieldId: t.finalCut, neededWhenMade: true }, database)).rejects.toThrow(
      PROJECT_ERRORS.fileFieldWhenMade
    )
  })
})

describe("who can change a field", () => {
  it("holds the rule on every save, and the site admin can always change it", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await expect(
      setTaskFieldValue(actor(ben), { taskId, fieldId: t.footage, value: "https://other.example.test" }, database)
    ).rejects.toThrow("Only whoever handed the task out or the site admin can change Footage link.")
    await updateTypeField(admin.id, { fieldId: t.thumbnail, whoCanChange: "assignee" }, database)
    await setTaskFieldValue(actor(ben), { taskId, fieldId: t.thumbnail, value: "Arrow" }, database)
    // Anna handed the task out, but Thumbnail is the assignee's: only the site admin gets past that.
    await expect(
      setTaskFieldValue(actor(anna), { taskId, fieldId: t.thumbnail, value: "Square" }, database)
    ).rejects.toThrow("Only the person assigned or the site admin can change Thumbnail.")
    await setTaskFieldValue(actor(admin), { taskId, fieldId: t.thumbnail, value: "Circle" }, database)
    const detail = await loadTaskDetail(ben.id, taskId, database)
    expect(detail.fields.type?.fields.find((f) => f.id === t.footage)).toMatchObject({ canChange: false })
    expect(detail.fields.type?.fields.find((f) => f.id === t.thumbnail)).toMatchObject({ canChange: true })
  })

  it("keeps the brief with whoever first handed the task out, however it is handed around", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await addProjectMember(admin.id, website, carla.id, database)
    // Ben, who is doing it, hands it to Carla and takes it back.
    await assignTask(actor(ben), { taskId, assigneeUserId: carla.id }, database)
    await assignTask(actor(ben), { taskId, assigneeUserId: ben.id }, database)
    await expect(
      setTaskFieldValue(actor(ben), { taskId, fieldId: t.footage, value: "https://other.example.test" }, database)
    ).rejects.toThrow("Only whoever handed the task out or the site admin can change Footage link.")
    const [row] = await database.select().from(projectTasks).where(eq(projectTasks.id, taskId))
    expect(row.firstHandedOutByUserId).toBe(anna.id)
  })

  it("lets only whoever handed the task out or the site admin change its type", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    // Switching to a plain task would get past "Needed before Done".
    await expect(setTaskType(actor(ben), { taskId, typeId: null }, database)).rejects.toThrow(
      PROJECT_ERRORS.cantChangeType
    )
    expect((await loadTaskDetail(ben.id, taskId, database)).fields.canChangeType).toBe(false)
    await setTaskType(actor(anna), { taskId, typeId: null }, database)
    expect((await card(taskId)).type).toBeNull()
  })

  it("holds it for a file in a File field too", async () => {
    const t = await videoEditing()
    await updateTypeField(admin.id, { fieldId: t.finalCut, whoCanChange: "assignee" }, database)
    const taskId = await plainTask("Cut")
    await setTaskType(actor(anna), { taskId, typeId: t.typeId }, database)
    const { storage } = memoryStorage()
    await expect(
      addTaskFile(
        actor(ben),
        { taskId, name: "cut.mp4", mimeType: "video/mp4", data: new Uint8Array(5).fill(1), fieldId: t.finalCut },
        database,
        storage
      )
    ).rejects.toThrow("Only the person assigned or the site admin can change Final cut.")
  })
})

describe("Show only when", () => {
  it("names a dropdown of the same type and never makes a loop", async () => {
    const t = await videoEditing()
    await expect(
      updateTypeField(admin.id, { fieldId: t.platform, showWhen: { fieldId: t.footage, choiceId: t.youtube } }, database)
    ).rejects.toThrow(PROJECT_ERRORS.showWhenWrong)
    const { id: format } = await createTypeField(admin.id, { typeId: t.typeId, name: "Format", kind: "dropdown" }, database)
    await updateTypeField(admin.id, { fieldId: format, choices: [{ name: "Short" }] }, database)
    const short = (await listTeamTypes(teamId, database))[0].fields.find((f) => f.id === format)!.settings.choices![0].id
    await updateTypeField(admin.id, { fieldId: format, showWhen: { fieldId: t.platform, choiceId: t.tiktok } }, database)
    await expect(
      updateTypeField(admin.id, { fieldId: t.platform, showWhen: { fieldId: format, choiceId: short } }, database)
    ).rejects.toThrow(PROJECT_ERRORS.showWhenLoop)
  })
})

describe("which types a project uses", () => {
  it("offers only the ticked types in New task, and a Just me task any type", async () => {
    const t = await videoEditing()
    await setProjectTypes(admin.id, { projectId: website, defaultTypeId: t.typeId }, database)
    await setProjectTypes(admin.id, { projectId: website, hiddenTypeIds: [t.typeId] }, database)
    // The default goes with the type it pointed at.
    expect((await loadProjectPage(anna.id, website, database)).project.defaultTypeId).toBeNull()
    await expect(videoTask(t)).rejects.toThrow(PROJECT_ERRORS.typeNotOffered)
    await createTask(
      actor(anna),
      {
        projectId: PERSONAL_PROJECT_ID,
        title: "Edit my reel",
        notes: "",
        assigneeUserId: anna.id,
        dueDate: null,
        steps: [],
        typeId: t.typeId,
        fieldValues: { [t.footage]: "https://drive.example.test/me" },
      },
      database
    )
  })

  it("keeps a task's type when it moves into a project that doesn't offer it, and says so", async () => {
    const t = await videoEditing()
    const taskId = await videoTask(t)
    await setProjectTypes(admin.id, { projectId: shop, hiddenTypeIds: [t.typeId] }, database)
    const detail = await loadTaskDetail(anna.id, taskId, database)
    expect(detail.moveTargets.find((target) => target.id === shop)?.offersType).toBe(false)
    await moveTask(actor(anna), { taskId, projectId: shop }, database)
    expect((await card(taskId, anna.id, shop)).type?.id).toBe(t.typeId)
  })

  it("never adds steps or touches notes when a type is picked on a task that exists", async () => {
    const t = await videoEditing()
    await updateTaskType(admin.id, { typeId: t.typeId, steps: ["Rough cut", "Colour"] }, database)
    const taskId = await plainTask("Cut")
    await setTaskType(actor(anna), { taskId, typeId: t.typeId }, database)
    const detail = await loadTaskDetail(anna.id, taskId, database)
    expect(detail.steps).toEqual([])
    expect(detail.task.notes).toBe("")
    expect(detail.fields.type?.name).toBe("Video editing")
  })
})
