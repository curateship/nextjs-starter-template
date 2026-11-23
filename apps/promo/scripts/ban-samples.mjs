/**
 * Sample bans for the local database, so the Bans dashboard, a phone's
 * Banned on line, the Map's marks, the sellers and the project counts have
 * something to look at (Bans task, part 12: "Ship sample rows in the local
 * fixtures so there is something to look at").
 *
 *   node --env-file=.env.local scripts/ban-samples.mjs            adds them
 *   node --env-file=.env.local scripts/ban-samples.mjs --remove   takes them away
 *
 * Local only: it refuses an address that is not on this computer. It adds
 * rows for the person who owns the Promo accounts already there, and never a
 * workspace or a user. Every row it writes has an id starting `sample-ban-`,
 * which is how --remove finds them.
 */
import pg from "pg"

const url = process.env.CUSTOM_SHELL_DATABASE_URL
if (!url) {
  console.error("CUSTOM_SHELL_DATABASE_URL is required. Run it with --env-file=.env.local.")
  process.exit(1)
}
const host = new URL(url).hostname
if (host !== "localhost" && host !== "127.0.0.1") {
  console.error(`That database is on ${host}. Sample bans go into the local database only.`)
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()
const id = (name) => `sample-ban-${name}`
const daysAgo = (days, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString()

async function remove() {
  // Rows the app itself wrote about a sample account or phone (a Clean up or
  // an "It's a ban" pressed on one) go too, or they would keep counting.
  await client.query(`DELETE FROM "promo_bans" WHERE "account_id" LIKE 'sample-ban-%' OR "phone_id" LIKE 'sample-ban-%'`)
  await client.query(`DELETE FROM "promo_ban_phrases" WHERE "account_id" LIKE 'sample-ban-%'`)
  await client.query(`DELETE FROM "promo_account_events" WHERE "account_id" LIKE 'sample-ban-%'`)
  await client.query(`DELETE FROM "promo_phone_tenancies" WHERE "phone_id" LIKE 'sample-ban-%'`)
  await client.query(`DELETE FROM "promo_phone_events" WHERE "phone_id" LIKE 'sample-ban-%'`)
  await client.query(`DELETE FROM "promo_phone_actions" WHERE "phone_id" LIKE 'sample-ban-%'`)
  // Children first; the phones and proxies go last.
  for (const table of ["promo_bans", "promo_ban_phrases", "promo_account_events", "promo_phone_tenancies", "promo_phone_events"]) {
    await client.query(`DELETE FROM "${table}" WHERE "id" LIKE 'sample-ban-%'`)
  }
  await client.query(`DELETE FROM "promo_accounts" WHERE "id" LIKE 'sample-ban-%'`)
  await client.query(`DELETE FROM "promo_phones" WHERE "id" LIKE 'sample-ban-%'`)
  await client.query(`DELETE FROM "promo_proxies" WHERE "id" LIKE 'sample-ban-%'`)
}

try {
  await remove()
  if (process.argv.includes("--remove")) {
    console.log("Sample bans removed.")
  } else {
    const owner = (await client.query(`SELECT "user_id" FROM "promo_accounts" ORDER BY "created_at" LIMIT 1`)).rows[0]?.user_id
    if (!owner) throw new Error("There is no Promo account yet, so there is nobody to file the samples under.")
    const project = (await client.query(`SELECT "id" FROM "promo_projects" WHERE "user_id" = $1 ORDER BY "created_at" LIMIT 1`, [owner])).rows[0]?.id ?? null

    await client.query(
      `INSERT INTO "promo_proxies" ("id", "user_id", "host", "port", "label", "country") VALUES ($1, $2, 'gate.sample.test', 8000, 'Sample US home line', 'US')`,
      [id("proxy"), owner]
    )
    const phones = [
      { key: "phone-a", name: "Sample Pixel A", slot: "1", sim: "+1 555 0100", carrier: "Mint Mobile", connection: "sim", proxy: null },
      { key: "phone-b", name: "Sample Pixel B", slot: "2", sim: "", carrier: "", connection: "wifi", proxy: id("proxy") },
      { key: "phone-c", name: "Sample iPhone C", slot: "3", sim: "+1 555 0177", carrier: "Visible", connection: "sim", proxy: null },
    ]
    for (const phone of phones) {
      await client.query(
        `INSERT INTO "promo_phones" ("id", "user_id", "name", "kind", "model", "serial", "sim_carrier", "sim_number", "connection", "proxy_id", "shelf_slot")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id(phone.key), owner, phone.name, phone.key === "phone-c" ? "iphone" : "android", phone.name.replace("Sample ", ""), id(phone.key), phone.carrier, phone.sim, phone.connection, phone.proxy, phone.slot]
      )
    }

    // Accounts: three banned and gone, one stopped and appealed, one stopped
    // by a locked screen, and a neighbour on a banned phone.
    const accounts = [
      { key: "ig-1", platform: "instagram", handle: "sample.cafe.one", phone: null, source: "bought", seller: "Seller A", price: 4000, retired: 9 },
      { key: "ig-2", platform: "instagram", handle: "sample.cafe.two", phone: null, source: "bought", seller: "Seller A", price: 4000, retired: null },
      { key: "ig-3", platform: "instagram", handle: "sample.cafe.three", phone: "phone-b", source: "bought", seller: "Seller A", price: 4000, retired: null },
      { key: "tt-1", platform: "tiktok", handle: "sample.eats", phone: "phone-a", source: "bought", seller: "Seller B", price: 1500, retired: null },
      { key: "rd-1", platform: "reddit", handle: "sample_persona", phone: "phone-c", source: "made", seller: "", price: null, retired: null },
    ]
    for (const account of accounts) {
      await client.query(
        `INSERT INTO "promo_accounts" ("id", "user_id", "platform", "handle", "phone_id", "project_id", "source", "seller", "price_cents", "retired_at", "retired_reason", "created_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id(account.key),
          owner,
          account.platform,
          account.handle,
          account.phone ? id(account.phone) : null,
          project,
          account.source,
          account.seller,
          account.price,
          account.retired ? daysAgo(account.retired) : null,
          account.retired ? "banned" : "",
          daysAgo(40),
        ]
      )
    }
    // ig-1 was banned on phone A and cleaned up; ig-2 was banned on phone A too and retired off it.
    await client.query(`UPDATE "promo_accounts" SET "retired_at" = $2, "retired_reason" = 'banned' WHERE "id" = $1`, [id("ig-2"), daysAgo(3)])
    // ig-3 is stopped right now, appealed 8 days ago. rd-1 hit a locked screen.
    await client.query(`UPDATE "promo_accounts" SET "blocked" = true, "blocked_reason" = 'Your account has been suspended', "ban_screen_at" = $2 WHERE "id" = $1`, [id("ig-3"), daysAgo(9)])
    await client.query(`UPDATE "promo_accounts" SET "blocked" = true, "blocked_reason" = 'Your account has been locked', "ban_screen_at" = $2 WHERE "id" = $1`, [id("rd-1"), daysAgo(0, 5)])

    const bans = [
      { key: "1", account: "ig-1", app: "instagram", handle: "sample.cafe.one", kind: "suspended", words: "We suspended your account", phone: "phone-a", proxy: null, sim: "+1 555 0100", carrier: "Mint Mobile", at: daysAgo(10), posts: 6, cleaned: daysAgo(9) },
      { key: "2", account: "ig-2", app: "instagram", handle: "sample.cafe.two", kind: "suspended", words: "Your account has been disabled", phone: "phone-a", proxy: null, sim: "+1 555 0100", carrier: "Mint Mobile", at: daysAgo(4), posts: 11, cleaned: daysAgo(3) },
      { key: "3", account: "ig-3", app: "instagram", handle: "sample.cafe.three", kind: "suspended", words: "Your account has been suspended", phone: "phone-b", proxy: id("proxy"), sim: "", carrier: "", at: daysAgo(9), posts: 3, cleaned: null, appealed: daysAgo(8) },
      { key: "4", account: "rd-1", app: "reddit", handle: "sample_persona", kind: "locked", words: "Your account has been locked", phone: "phone-c", proxy: null, sim: "+1 555 0177", carrier: "Visible", at: daysAgo(0, 5), posts: 2, cleaned: null },
      { key: "5", account: null, app: "tiktok", handle: "sample.gone", kind: "suspended", words: "Your account was permanently banned", phone: "phone-c", proxy: null, sim: "+1 555 0177", carrier: "Visible", at: daysAgo(45), posts: 0, cleaned: daysAgo(44) },
    ]
    for (const ban of bans) {
      await client.query(
        `INSERT INTO "promo_bans" ("id", "user_id", "account_id", "app", "handle", "kind", "words", "phone_id", "proxy_id", "sim_number", "sim_carrier", "project_id", "account_born_at", "posts_week", "at", "cleaned_up_at", "appealed_at", "appeal_note")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          id(`row-${ban.key}`),
          owner,
          ban.account ? id(ban.account) : null,
          ban.app,
          ban.handle,
          ban.kind,
          ban.words,
          id(ban.phone),
          ban.proxy,
          ban.sim,
          ban.carrier,
          project,
          daysAgo(40),
          ban.posts,
          ban.at,
          ban.cleaned,
          ban.appealed ?? null,
          ban.appealed ? "Sent from the app's help screen" : "",
        ]
      )
    }
    await client.query(
      `INSERT INTO "promo_phone_events" ("id", "user_id", "phone_id", "kind", "detail", "created_at") VALUES
        ($1, $2, $3, 'banned', '@sample.cafe.one on Instagram, suspended: "We suspended your account"', $4),
        ($5, $2, $3, 'banned', '@sample.cafe.two on Instagram, suspended: "Your account has been disabled"', $6)`,
      [id("event-1"), owner, id("phone-a"), daysAgo(10), id("event-2"), daysAgo(4)]
    )
    await client.query(
      `INSERT INTO "promo_phone_tenancies" ("id", "user_id", "phone_id", "account_id", "platform", "handle", "arrived_at", "left_at", "left_how") VALUES
        ($1, $2, $3, $4, 'instagram', 'sample.cafe.one', $5, $6, 'banned'),
        ($7, $2, $3, $8, 'instagram', 'sample.cafe.two', $9, $10, 'banned'),
        ($11, $2, $3, $12, 'tiktok', 'sample.eats', $13, NULL, '')`,
      [id("stay-1"), owner, id("phone-a"), id("ig-1"), daysAgo(40), daysAgo(9), id("stay-2"), id("ig-2"), daysAgo(8), daysAgo(3), id("stay-3"), id("tt-1"), daysAgo(40)]
    )
    await client.query(
      `INSERT INTO "promo_account_events" ("id", "user_id", "account_id", "kind", "detail", "created_at") VALUES
        ($1, $2, $3, 'added', 'Added on a phone.', $4),
        ($5, $2, $3, 'banned', 'Suspended: "Your account has been suspended"', $6),
        ($7, $2, $3, 'appealed', 'Appealed: Sent from the app''s help screen', $8)`,
      [id("line-1"), owner, id("ig-3"), daysAgo(40), id("line-2"), daysAgo(9), id("line-3"), daysAgo(8)]
    )
    await client.query(
      `INSERT INTO "promo_ban_phrases" ("id", "user_id", "app", "line", "account_id", "phone_id", "words", "created_at")
       VALUES ($1, $2, 'tiktok', 'Your account is under review for 48 hours', $3, $4, 'Your account is under review for 48 hours OK', $5)`,
      [id("phrase"), owner, id("tt-1"), id("phone-a"), daysAgo(0, 2)]
    )
    await client.query(`UPDATE "promo_accounts" SET "blocked" = true, "blocked_reason" = 'Your account is under review for 48 hours OK', "ban_screen_at" = $2 WHERE "id" = $1`, [id("tt-1"), daysAgo(0, 2)])
    console.log("Sample bans added: 3 phones, 5 accounts, 5 bans, 1 screen Promo is asking about. Remove them with --remove.")
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await client.end()
}
