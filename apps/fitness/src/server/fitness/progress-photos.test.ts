import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { CustomShellDb } from "@/server/db"
import {
  builtInBySlug,
  createExercise,
  deleteExercise,
  deleteExercises,
  listExercises,
  updateExercise,
} from "@/server/fitness/exercises"
import {
  createPhotoSession,
  listPhotoSessions,
  photoKeyFor,
  savePhoto,
  type PhotoStorage,
} from "@/server/fitness/photos"
import { loadLiftHistory, loadRecords, loadWeighIns, saveWeighIn } from "@/server/fitness/progress"
import { fitnessCoachClients } from "@/server/fitness/schema"
import {
  addExerciseToWorkout,
  finishWorkout,
  loadWorkout,
  saveSet,
  startWorkout,
} from "@/server/fitness/workouts"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
})

afterEach(async () => {
  await client.close()
})

/** A fake bucket that remembers what was put and removed. */
function fakeStorage() {
  const stored = new Map<string, string>()
  const removed: string[] = []
  const storage: PhotoStorage = {
    put: async (path, _data, mimeType) => {
      stored.set(path, mimeType)
    },
    remove: async (path) => {
      removed.push(path)
    },
  }
  return { storage, stored, removed }
}

async function benchDay(sets: { weightKg: number; reps: number }[]) {
  const lifts = await builtInBySlug(database)
  const bench = lifts.get("bench-press")!
  const { id } = await startWorkout(anna.id, { from: "empty" }, database)
  await addExerciseToWorkout(anna.id, id, bench.id, database)
  const workout = await loadWorkout(anna.id, id, database)
  const rows = workout.exercises[0].sets
  for (const [index, set] of sets.entries()) {
    await saveSet(anna.id, rows[index].id, { weightKg: set.weightKg, reps: set.reps, done: true }, database)
  }
  await finishWorkout(anna.id, id, { effort: null, note: "" }, database)
  return bench.id
}

describe("weigh-ins", () => {
  it("keeps one weigh-in a day and averages the seven days ending on each", async () => {
    await saveWeighIn(anna.id, { day: "2099-01-01", weightKg: 80 }, database)
    await saveWeighIn(anna.id, { day: "2099-01-02", weightKg: 83 }, database)
    await saveWeighIn(anna.id, { day: "2099-01-02", weightKg: 82 }, database)
    const trend = await loadWeighIns(anna.id, anna.id, database)
    expect(trend).toEqual([
      { day: "2099-01-01", weightKg: 80, averageKg: 80 },
      { day: "2099-01-02", weightKg: 82, averageKg: 81 },
    ])
  })

  it("refuses someone else's weigh-ins", async () => {
    await expect(loadWeighIns(ben.id, anna.id, database)).rejects.toThrow(FITNESS_ERRORS.workoutNotFound)
  })
})

describe("records", () => {
  it("reads each lift's best numbers from finished workouts", async () => {
    const benchId = await benchDay([
      { weightKg: 60, reps: 8 },
      { weightKg: 70, reps: 5 },
      { weightKg: 75, reps: 1 },
    ])
    const [record] = await loadRecords(anna.id, anna.id, database)
    expect(record.exerciseId).toBe(benchId)
    expect(record.heaviestKg).toBe(75)
    // 70 kg for 5 reps is about 81.7 kg, more than 75 kg once.
    expect(record.oneRepMaxKg).toBeCloseTo(81.67, 1)
    expect(record.mostReps).toBe(8)
    expect(record.sessions).toBe(1)
    const history = await loadLiftHistory(anna.id, anna.id, benchId, database)
    expect(history).toHaveLength(1)
    await expect(loadRecords(ben.id, anna.id, database)).rejects.toThrow(FITNESS_ERRORS.workoutNotFound)
  })
})

// The first bytes of a real JPEG and PNG: the server reads a photo's type from them.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe("before and after photos", () => {
  async function photoDay() {
    const { storage, stored } = fakeStorage()
    const session = await createPhotoSession(
      anna.id,
      {
        day: "2099-01-01",
        bodyweightKg: 80,
        chestCm: null,
        waistCm: 84,
        hipsCm: null,
        armCm: null,
        thighCm: null,
        note: "",
      },
      database
    )
    const saved = await savePhoto(
      anna.id,
      { sessionId: session.id, slot: "front", mimeType: "image/jpeg", data: JPEG },
      database,
      storage
    )
    return { session: saved, stored }
  }

  it("keeps the storage key on the server and hands out the private address", async () => {
    const { session, stored } = await photoDay()
    const [key] = [...stored.keys()]
    expect(key.startsWith(`fitness-photos/${anna.id}/`)).toBe(true)
    expect(session.photos.front?.startsWith(`/api/fitness/photos/${session.id}/front`)).toBe(true)
    expect(JSON.stringify(session)).not.toContain(key)
    expect(await photoKeyFor(anna.id, session.id, "front", database)).toBe(key)
  })

  it("refuses a stranger, and a coach until the client accepts and switches photos on", async () => {
    const { session } = await photoDay()
    await expect(listPhotoSessions(ben.id, anna.id, database)).rejects.toThrow(FITNESS_ERRORS.photoNotFound)
    expect(await photoKeyFor(ben.id, session.id, "front", database)).toBeNull()

    // Asked but not yet answered, with photos on: still nothing.
    await database.insert(fitnessCoachClients).values({
      coachUserId: ben.id,
      clientUserId: anna.id,
      photosAllowed: true,
      acceptedAt: null,
      createdAt: new Date(),
    })
    expect(await photoKeyFor(ben.id, session.id, "front", database)).toBeNull()

    // Accepted, photos off: still nothing.
    await database.execute(
      `update fitness_coach_clients set accepted_at = now(), photos_allowed = false where coach_user_id = '${ben.id}'` as never
    )
    expect(await photoKeyFor(ben.id, session.id, "front", database)).toBeNull()

    // Accepted and switched on.
    await database.execute(
      `update fitness_coach_clients set photos_allowed = true where coach_user_id = '${ben.id}'` as never
    )
    expect(await photoKeyFor(ben.id, session.id, "front", database)).not.toBeNull()
    expect(await listPhotoSessions(ben.id, anna.id, database)).toHaveLength(1)
  })

  it("refuses a file that isn't a photo, and one that's too big", async () => {
    const { session } = await photoDay()
    const { storage, stored } = fakeStorage()
    // A page dressed up as a photo: the browser said JPEG, the bytes say otherwise.
    const page = new TextEncoder().encode("<html><script>alert(1)</script></html>")
    await expect(
      savePhoto(anna.id, { sessionId: session.id, slot: "side", mimeType: "image/jpeg", data: page }, database, storage)
    ).rejects.toThrow(FITNESS_ERRORS.photoType)
    // A real PNG the browser called a JPEG is stored, and served, as a PNG.
    await savePhoto(anna.id, { sessionId: session.id, slot: "side", mimeType: "image/jpeg", data: PNG }, database, storage)
    expect([...stored.values()]).toEqual(["image/png"])
    await expect(
      savePhoto(anna.id, { sessionId: session.id, slot: "side", mimeType: "application/pdf", data: new Uint8Array(1) }, database, storage)
    ).rejects.toThrow(FITNESS_ERRORS.photoType)
    await expect(
      savePhoto(
        anna.id,
        { sessionId: session.id, slot: "side", mimeType: "image/png", data: new Uint8Array(16 * 1024 * 1024) },
        database,
        storage
      )
    ).rejects.toThrow(FITNESS_ERRORS.photoTooBig)
    await expect(
      savePhoto(ben.id, { sessionId: session.id, slot: "side", mimeType: "image/png", data: PNG }, database, storage)
    ).rejects.toThrow(FITNESS_ERRORS.photoNotFound)
  })
})

describe("exercise library", () => {
  const own = {
    name: "Cable hug",
    routineType: "strength",
    muscles: ["chest" as const],
    equipment: ["cable" as const],
    movement: "isolation" as const,
    isBodyweight: false,
    isTimed: false,
    pictureUrl: null,
  }

  it("makes, changes and deletes a lift of your own", async () => {
    const made = await createExercise(anna.id, own, database)
    expect(made).toMatchObject({ name: "Cable hug", builtIn: false })
    const changed = await updateExercise(anna.id, made.id, { ...own, name: "Cable crossover hug" }, database)
    expect(changed.name).toBe("Cable crossover hug")
    await expect(updateExercise(ben.id, made.id, own, database)).rejects.toThrow(FITNESS_ERRORS.exerciseNotFound)
    await deleteExercise(anna.id, made.id, database)
    await expect(deleteExercise(anna.id, made.id, database)).rejects.toThrow(FITNESS_ERRORS.exerciseNotFound)
  })

  it("refuses to change a built-in lift or delete one with logged sets", async () => {
    const lifts = await builtInBySlug(database)
    await expect(updateExercise(anna.id, lifts.get("deadlift")!.id, own, database)).rejects.toThrow(
      FITNESS_ERRORS.builtInExercise
    )
    const made = await createExercise(anna.id, own, database)
    const { id } = await startWorkout(anna.id, { from: "empty" }, database)
    await addExerciseToWorkout(anna.id, id, made.id, database)
    await expect(deleteExercise(anna.id, made.id, database)).rejects.toThrow(FITNESS_ERRORS.exerciseHasSets)
  })

  it("deletes several at once and keeps the ones it can't delete", async () => {
    const lifts = await builtInBySlug(database)
    const first = await createExercise(anna.id, own, database)
    const second = await createExercise(anna.id, { ...own, name: "Cable fly two" }, database)
    const logged = await createExercise(anna.id, { ...own, name: "Logged lift" }, database)
    const { id } = await startWorkout(anna.id, { from: "empty" }, database)
    await addExerciseToWorkout(anna.id, id, logged.id, database)
    const result = await deleteExercises(
      anna.id,
      [first.id, second.id, logged.id, lifts.get("deadlift")!.id],
      database
    )
    expect(result.done).toEqual([first.id, second.id])
    expect(result.kept).toEqual([logged.id, lifts.get("deadlift")!.id])
  })

  it("lists only one routine type's lifts when asked", async () => {
    await createExercise(anna.id, own, database)
    const strength = await listExercises(anna.id, database, "strength")
    expect(strength.length).toBeGreaterThan(100)
    expect(strength.every((exercise) => exercise.routineType === "strength")).toBe(true)
    const calisthenics = await listExercises(anna.id, database, "calisthenics")
    expect(calisthenics.map((exercise) => exercise.name)).toContain("Knee push-up")
    expect(calisthenics.every((exercise) => exercise.routineType === "calisthenics")).toBe(true)
    expect(await listExercises(anna.id, database, "running")).toEqual([])
  })
})
