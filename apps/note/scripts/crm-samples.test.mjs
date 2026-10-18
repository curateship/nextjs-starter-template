import assert from "node:assert/strict"
import { test } from "node:test"
import { readFile, readdir } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"

import { CRM_SAMPLE_LEADS, seedCrmSamples } from "./crm-samples.mjs"

/** The account `setup-database.mjs` creates, and the one anybody signs in as. */
const ADMIN = "owner@example.com"

/**
 * A throwaway database with every migration applied and one workspace in it,
 * which is the state `db:setup` leaves behind before the samples are written.
 *
 * PGlite rather than a real server: it is the same Postgres the unit tests run
 * against, it needs nothing installed, and `query(sql, params)` behaves the way
 * `pg.Client` does, which is all the seed uses.
 */
async function freshDatabase() {
  const client = new PGlite()
  const folder = new URL("../drizzle/", import.meta.url)
  const migrations = (await readdir(folder))
    .filter((file) => file.endsWith(".sql"))
    .sort()
  for (const migration of migrations) {
    await client.exec(await readFile(new URL(migration, folder), "utf8"))
  }

  await client.query(
    `insert into users (id, email, name, role, password_hash, email_verified_at, created_at, updated_at)
     values ('user-1', $1, 'Owner', 'admin', 'x', now(), now(), now())`,
    [ADMIN]
  )
  await client.query(
    `insert into workspaces (id, user_id, name, settings, subdomain, created_at, updated_at)
     values ('ws-1', 'user-1', 'My project', '{}'::jsonb, 'my-project', now(), now())`
  )
  await client.query(
    "update users set current_workspace_id = 'ws-1' where id = 'user-1'"
  )
  return client
}

/** A second, newer workspace, with the admin moved into it. */
async function addNewerWorkspace(db, id = "ws-2") {
  await db.query(
    `insert into workspaces (id, user_id, name, settings, subdomain, created_at, updated_at)
     values ($1, 'user-1', 'Later project', '{}'::jsonb, $1, now(), now())`,
    [id]
  )
  await db.query("update users set current_workspace_id = $1 where id = 'user-1'", [
    id,
  ])
}

test("writes every sample lead, with its conversation and its mail", async () => {
  const db = await freshDatabase()
  await seedCrmSamples(db, { adminEmail: ADMIN })

  const leads = await db.query("select * from crm_leads order by id")
  assert.equal(leads.rows.length, CRM_SAMPLE_LEADS.length)

  const threads = await db.query("select * from crm_threads")
  assert.equal(threads.rows.length, CRM_SAMPLE_LEADS.length)

  const expectedMessages = CRM_SAMPLE_LEADS.reduce(
    (total, lead) => total + lead.messages.length,
    0
  )
  const messages = await db.query("select * from crm_messages")
  assert.equal(messages.rows.length, expectedMessages)

  // The count on the row is what the inbox draws, so it has to match the mail
  // actually written rather than be a number somebody typed.
  for (const thread of threads.rows) {
    const held = await db.query(
      "select count(*)::int as total from crm_messages where thread_id = $1",
      [thread.id]
    )
    assert.equal(thread.message_count, held.rows[0].total)
  }
})

test("covers every state the screen can be in", async () => {
  const db = await freshDatabase()
  await seedCrmSamples(db, { adminEmail: ADMIN })

  const stages = await db.query(
    "select distinct stage from crm_leads order by stage"
  )
  assert.deepEqual(
    stages.rows.map((row) => row.stage).sort(),
    ["contacted", "lost", "new", "quoted", "won"]
  )

  const statuses = await db.query(
    "select distinct status from crm_threads order by status"
  )
  assert.deepEqual(
    statuses.rows.map((row) => row.status).sort(),
    ["closed", "open", "snoozed"]
  )

  const unread = await db.query(
    "select count(*)::int as total from crm_threads where read_at is null"
  )
  assert.ok(unread.rows[0].total >= 1, "at least one conversation is unread")

  const due = await db.query(
    `select count(*)::int as total from crm_leads
     where follow_up_at is not null and follow_up_at <= now()`
  )
  assert.equal(due.rows[0].total, 1, "exactly one chase date has passed")

  const waiting = await db.query(
    "select count(*)::int as total from crm_messages where body_fetched_at is null"
  )
  assert.equal(
    waiting.rows[0].total,
    1,
    "one message is still waiting on its body"
  )

  const attached = await db.query(
    "select count(*)::int as total from crm_messages where jsonb_array_length(attachments) > 0"
  )
  assert.ok(attached.rows[0].total >= 1, "at least one message has a file")
})

test("running it twice writes nothing the second time", async () => {
  const db = await freshDatabase()
  await seedCrmSamples(db, { adminEmail: ADMIN })
  await seedCrmSamples(db, { adminEmail: ADMIN })

  const leads = await db.query("select count(*)::int as total from crm_leads")
  assert.equal(leads.rows[0].total, CRM_SAMPLE_LEADS.length)
  const messages = await db.query(
    "select count(*)::int as total from crm_messages"
  )
  const expected = CRM_SAMPLE_LEADS.reduce(
    (total, lead) => total + lead.messages.length,
    0
  )
  assert.equal(messages.rows[0].total, expected)
})

test("tops up a sample that was deleted", async () => {
  const db = await freshDatabase()
  await seedCrmSamples(db, { adminEmail: ADMIN })
  await db.query("delete from crm_leads where id = $1", ["sample-lead-4"])

  await seedCrmSamples(db, { adminEmail: ADMIN })

  const leads = await db.query("select count(*)::int as total from crm_leads")
  assert.equal(leads.rows[0].total, CRM_SAMPLE_LEADS.length)
})

test("never touches an install that has real mail in it", async () => {
  const db = await freshDatabase()
  await db.query(
    `insert into crm_leads (id, workspace_id, email, stage, created_at, updated_at)
     values ('real-lead', 'ws-1', 'somebody@real.com', 'new', now(), now())`
  )

  await seedCrmSamples(db, { adminEmail: ADMIN })

  const leads = await db.query("select id from crm_leads")
  assert.deepEqual(
    leads.rows.map((row) => row.id),
    ["real-lead"]
  )
})

test("files the samples in the workspace the admin is in, not the oldest", async () => {
  const db = await freshDatabase()
  await addNewerWorkspace(db)

  await seedCrmSamples(db, { adminEmail: ADMIN })

  const where = await db.query(
    "select distinct workspace_id from crm_leads"
  )
  assert.deepEqual(
    where.rows.map((row) => row.workspace_id),
    ["ws-2"],
    "the oldest workspace is not where somebody is looking"
  )
})

test("moves samples left in another workspace rather than leaving an empty inbox", async () => {
  const db = await freshDatabase()
  // Seeded while the admin was in the first workspace, as happened on a real
  // machine that had had a few over the months.
  await seedCrmSamples(db, { adminEmail: ADMIN })
  await addNewerWorkspace(db)

  await seedCrmSamples(db, { adminEmail: ADMIN })

  const where = await db.query("select distinct workspace_id from crm_leads")
  assert.deepEqual(where.rows.map((row) => row.workspace_id), ["ws-2"])

  const leads = await db.query("select count(*)::int as total from crm_leads")
  assert.equal(leads.rows[0].total, CRM_SAMPLE_LEADS.length)

  // The mail moved with them rather than being orphaned by the delete.
  const messages = await db.query(
    "select count(*)::int as total from crm_messages where workspace_id = 'ws-2'"
  )
  const expected = CRM_SAMPLE_LEADS.reduce(
    (total, lead) => total + lead.messages.length,
    0
  )
  assert.equal(messages.rows[0].total, expected)
})

test("ignores an older admin fixture and follows the account that signs in", async () => {
  const db = await freshDatabase()
  // A sample account that joined earlier and sits in a different workspace, of
  // the kind a demo database is full of.
  await db.query(
    `insert into users (id, email, name, role, password_hash, email_verified_at, created_at, updated_at)
     values ('fixture-1', 'maya@example.com', 'Maya', 'admin', 'x', now(), now() - interval '200 days', now())`
  )
  await db.query(
    `insert into workspaces (id, user_id, name, settings, subdomain, created_at, updated_at)
     values ('ws-fixture', 'fixture-1', 'Demo', '{}'::jsonb, 'demo', now() - interval '200 days', now())`
  )
  await db.query(
    "update users set current_workspace_id = 'ws-fixture' where id = 'fixture-1'"
  )

  await seedCrmSamples(db, { adminEmail: ADMIN })

  const where = await db.query("select distinct workspace_id from crm_leads")
  assert.deepEqual(
    where.rows.map((row) => row.workspace_id),
    ["ws-1"],
    "the samples belong to the account that signs in, not the oldest admin"
  )
})

test("falls back to another admin when the named one has no workspace", async () => {
  const db = await freshDatabase()
  await seedCrmSamples(db, { adminEmail: "nobody@example.com" })

  const where = await db.query("select distinct workspace_id from crm_leads")
  assert.deepEqual(where.rows.map((row) => row.workspace_id), ["ws-1"])
})

test("writes nothing when there is no workspace to hang it on", async () => {
  const db = await freshDatabase()
  await db.query("update users set current_workspace_id = null")
  await db.query("delete from workspaces")

  await seedCrmSamples(db, { adminEmail: ADMIN })

  const leads = await db.query("select count(*)::int as total from crm_leads")
  assert.equal(leads.rows[0].total, 0)
})
