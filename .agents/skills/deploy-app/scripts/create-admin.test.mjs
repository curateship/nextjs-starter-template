import assert from "node:assert/strict"
import { test } from "node:test"

import { databaseLogin, UPSERT_ADMIN_SQL } from "./create-admin.mjs"

test("reads the login out of a database address, decoding escaped characters", () => {
  assert.deepEqual(databaseLogin("postgres://pomodoro:p%40ss%2Fw@db.example:5432/pomodoro"), {
    user: "pomodoro",
    password: "p@ss/w",
    database: "pomodoro",
  })
})

test("the admin statement makes a new account or promotes the existing one, never demotes", () => {
  assert.match(UPSERT_ADMIN_SQL, /on conflict \(email\) do update/)
  assert.match(UPSERT_ADMIN_SQL, /role = 'admin'/)
  // An account verified earlier keeps its original verification time.
  assert.match(UPSERT_ADMIN_SQL, /email_verified_at = coalesce\(users\.email_verified_at, now\(\)\)/)
  assert.equal((UPSERT_ADMIN_SQL.match(/\$\d/g) ?? []).length, 4)
})
