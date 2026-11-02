import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  buildLogTail,
  coolifyMayRecover,
  copiesMenu,
  deploymentOver,
  lockedCommit,
  migrationsBetween,
  parseEnvText,
  readFlags,
  resourcesToDeploy,
  startedAgo,
  unfinishedDeployments,
  wrongBuild,
} from "./deploy.mjs"

const pomodoro = {
  resources: [
    { role: "web", uuid: "w" },
    { role: "worker", uuid: "k" },
  ],
}

test("reads the app and the options", () => {
  assert.deepEqual(readFlags(["pomodoro"]), { app: "pomodoro", only: null, force: false, dryRun: false, push: false, skipMenu: false })
  assert.deepEqual(readFlags(["pomodoro", "--only", "web", "--force", "--push"]), {
    app: "pomodoro",
    only: "web",
    force: true,
    dryRun: false,
    push: true,
    skipMenu: false,
  })
  // Builds always go one at a time now, so the old switch is gone.
  assert.throws(() => readFlags(["pomodoro", "--in-order"]), /Unknown option --in-order/)
  assert.equal(readFlags(["pomodoro", "--skip-menu"]).skipMenu, true)
  // The AI keys are written at launch only, so a deploy has no switch for them.
  assert.throws(() => readFlags(["pomodoro", "--skip-ai-keys"]), /Unknown option --skip-ai-keys/)
  assert.equal(readFlags(["pomodoro", "--only=worker", "--dry-run"]).dryRun, true)
})

test("refuses a missing app, a second app, an unknown option and an empty --only", () => {
  assert.throws(() => readFlags([]), /Name the app/)
  // npm run deploy inside an app: npm supplies the app's name.
  assert.equal(readFlags(["--push"], "pomodoro").app, "pomodoro")
  assert.equal(readFlags(["trade"], "pomodoro").app, "trade")
  assert.throws(() => readFlags(["pomodoro", "trade"]), /One app at a time/)
  assert.throws(() => readFlags(["pomodoro", "--fast"]), /Unknown option/)
  assert.throws(() => readFlags(["pomodoro", "--only"]), /--only needs a list/)
})

test("copies the menu only after a website deploy, into an app with a database, unless skipped", () => {
  const withDatabase = { ...pomodoro, database: { uuid: "db" } }
  assert.equal(copiesMenu(withDatabase, resourcesToDeploy(withDatabase, null), false), true)
  assert.equal(copiesMenu(withDatabase, resourcesToDeploy(withDatabase, "worker"), false), false)
  assert.equal(copiesMenu(withDatabase, resourcesToDeploy(withDatabase, null), true), false)
  assert.equal(copiesMenu({ ...pomodoro, database: undefined }, resourcesToDeploy(pomodoro, null), false), false)
})

test("keeps the app's own order whatever order --only names them in", () => {
  assert.deepEqual(resourcesToDeploy(pomodoro, null).map((one) => one.role), ["web", "worker"])
  assert.deepEqual(resourcesToDeploy(pomodoro, "worker,web").map((one) => one.role), ["web", "worker"])
  assert.deepEqual(resourcesToDeploy(pomodoro, "worker").map((one) => one.role), ["worker"])
  assert.throws(() => resourcesToDeploy(pomodoro, "engine"), /Unknown resource engine/)
})

test("knows when Coolify has stopped working on a deployment", () => {
  for (const done of ["finished", "failed", "cancelled", "cancelled-by-user"]) assert.equal(deploymentOver(done), true)
  for (const going of ["queued", "in_progress", undefined]) assert.equal(deploymentOver(going), false)
})

test("shows the visible end of Coolify's build log", () => {
  const logs = JSON.stringify([
    { output: "Building docker image started.", hidden: false },
    { output: "#12 secret build step", hidden: true },
    { output: "New container is healthy.  ", hidden: false },
    { output: "", hidden: false },
  ])
  assert.deepEqual(buildLogTail(logs), ["Building docker image started.", "New container is healthy."])
  assert.deepEqual(buildLogTail(logs, 1), ["New container is healthy."])
  assert.deepEqual(buildLogTail("plain\ntext"), ["plain", "text"])
  assert.deepEqual(buildLogTail(""), [])
  assert.deepEqual(buildLogTail(null), [])
})

test("reads the keys file: skips comments and blanks, keeps = inside values, drops quotes", () => {
  const text = "# Coolify\n\nCOOLIFY_US_URL=http://5.78.189.158:8000\nCOOLIFY_US_TOKEN=8|abc=def\nQUOTED=\"x y\"\nnot a line\n=nokey\n"
  assert.deepEqual(parseEnvText(text), {
    COOLIFY_US_URL: "http://5.78.189.158:8000",
    COOLIFY_US_TOKEN: "8|abc=def",
    QUOTED: "x y",
  })
})

test("finds the migrations a release carries, wherever the command was typed", () => {
  // d43bd8b0d added Pomodoro's 0122 migration. `npm run deploy` runs from
  // apps/pomodoro, where a repo-relative path used to match nothing.
  const before = process.cwd()
  process.chdir(fileURLToPath(new URL("../../../../apps/pomodoro", import.meta.url)))
  try {
    assert.deepEqual(migrationsBetween("d43bd8b0d~1", "d43bd8b0d", "pomodoro"), ["0122_pomodoro_personal_rooms.sql"])
    assert.deepEqual(migrationsBetween("d43bd8b0d", "d43bd8b0d", "pomodoro"), [])
  } finally {
    process.chdir(before)
  }
})

test("keeps watching a build through a Coolify outage, but not a refusal", () => {
  // 24 Oct 2026: one 500 from Coolify mid-build ended a Project deploy.
  assert.equal(coolifyMayRecover(Object.assign(new Error("Server Error"), { status: 500 })), true)
  assert.equal(coolifyMayRecover(Object.assign(new Error("Bad Gateway"), { status: 502 })), true)
  assert.equal(coolifyMayRecover(new TypeError("fetch failed")), true)
  assert.equal(coolifyMayRecover(Object.assign(new Error("Unauthenticated."), { status: 401 })), false)
  assert.equal(coolifyMayRecover(Object.assign(new Error("Not found"), { status: 404 })), false)
})

test("cancels only a deploy left queued or running for over 30 minutes, and leaves a young one alone", () => {
  // Coolify's own times, with six digits after the second.
  const now = Date.parse("2026-10-31T12:45:00Z")
  const list = [
    { deployment_uuid: "dead", status: "in_progress", created_at: "2026-10-30T22:47:45.000000Z" },
    { deployment_uuid: "behind", status: "queued", created_at: "2026-10-30T23:27:22.000000Z" },
    { deployment_uuid: "young", status: "in_progress", created_at: "2026-10-31T12:41:00.000000Z" },
    { deployment_uuid: "done", status: "finished", created_at: "2026-10-30T21:52:27.000000Z" },
  ]
  const { stuck, running } = unfinishedDeployments(list, now)
  assert.deepEqual(stuck.map((one) => one.deployment_uuid), ["dead", "behind"])
  assert.deepEqual(running.map((one) => one.deployment_uuid), ["young"])
  assert.equal(startedAgo("2026-10-30T22:47:45.000000Z", now), "13h")
  assert.equal(startedAgo("2026-10-31T12:41:00.000000Z", now), "4m")
})

test("refuses an app Coolify keeps on one old commit (2 Nov 2026)", () => {
  assert.equal(lockedCommit({ git_commit_sha: "HEAD" }), null)
  assert.equal(lockedCommit({ git_commit_sha: "" }), null)
  assert.equal(lockedCommit({}), null)
  assert.equal(lockedCommit({ git_commit_sha: "72b98e3fa53a2daf2039cf8b072d42aee5b697fe" }), "72b98e3fa53a2daf2039cf8b072d42aee5b697fe")
})

test("fails a finished deployment that built some other commit", () => {
  const develop = "66a364441aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  assert.equal(wrongBuild(develop, develop), null)
  assert.equal(wrongBuild("66a364441", develop), null)
  assert.equal(wrongBuild("72b98e3fa53a2daf2039cf8b072d42aee5b697fe", develop), "Coolify built 72b98e3fa, not develop's 66a364441")
  assert.equal(wrongBuild(undefined, develop), "Coolify did not say which commit it built")
})
