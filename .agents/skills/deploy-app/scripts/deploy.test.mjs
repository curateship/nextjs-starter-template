import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { buildLogTail, copiesAiKeys, copiesMenu, deployPlan, deploymentOver, migrationsBetween, parseEnvText, readFlags, resourcesToDeploy } from "./deploy.mjs"

const pomodoro = {
  resources: [
    { role: "web", uuid: "w" },
    { role: "worker", uuid: "k" },
  ],
}

test("reads the app and the options", () => {
  assert.deepEqual(readFlags(["pomodoro"]), { app: "pomodoro", only: null, force: false, dryRun: false, push: false, inOrder: false, skipMenu: false, skipAiKeys: false })
  assert.deepEqual(readFlags(["pomodoro", "--only", "web", "--force", "--push"]), {
    app: "pomodoro",
    only: "web",
    force: true,
    dryRun: false,
    push: true,
    inOrder: false,
    skipMenu: false,
    skipAiKeys: false,
  })
  assert.equal(readFlags(["pomodoro", "--in-order"]).inOrder, true)
  assert.equal(readFlags(["pomodoro", "--skip-menu"]).skipMenu, true)
  assert.equal(readFlags(["pomodoro", "--skip-ai-keys"]).skipAiKeys, true)
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

test("copies the AI keys after any deploy of an app with a database, unless skipped", () => {
  assert.equal(copiesAiKeys({ ...pomodoro, database: { uuid: "db" } }, false), true)
  assert.equal(copiesAiKeys({ ...pomodoro, database: { uuid: "db" } }, true), false)
  assert.equal(copiesAiKeys(pomodoro, false), false)
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

test("builds both at once only when no migration ships and the live commit is known", () => {
  assert.equal(deployPlan({ count: 2, inOrder: false, liveCommit: "abc1234", migrations: [] }).together, true)
  const withMigration = deployPlan({ count: 2, inOrder: false, liveCommit: "abc1234", migrations: ["0123_pomodoro_x.sql"] })
  assert.equal(withMigration.together, false)
  assert.match(withMigration.why, /1 new migration \(0123_pomodoro_x\.sql\)/)
  assert.equal(deployPlan({ count: 2, inOrder: false, liveCommit: null, migrations: [] }).together, false)
  assert.equal(deployPlan({ count: 2, inOrder: true, liveCommit: "abc1234", migrations: [] }).together, false)
  assert.equal(deployPlan({ count: 1, inOrder: false, liveCommit: "abc1234", migrations: [] }).together, false)
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
