import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

/**
 * Two sample sites with a directory each, so every screen from the admin and
 * public tasks can be looked at without hand-entering anything.
 *
 * Run it yourself: `node scripts/seed-directory-sample.mjs`
 *
 * **Not part of `npm run db:setup`, on purpose.** That script belongs to the
 * shell, and this app never edits a shell file — an edited one conflicts on
 * every future shell merge, forever. So this is its own command. Nothing is
 * lost but one line to type.
 *
 * Safe to run more than once: everything is keyed on the site's subdomain and
 * each listing's address, so a second run updates what is there rather than
 * making a second copy. It never touches a site it did not make.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { Client } = pg

const sites = [
  {
    subdomain: "alpha",
    name: "Alpha Guide",
    categories: [
      { slug: "eat", name: "Eat", description: "Places to eat and drink." },
      {
        slug: "italian",
        name: "Italian",
        parent: "eat",
        description: "Pasta, pizza and the rest of it.",
      },
      { slug: "stay", name: "Stay", description: "Somewhere to sleep." },
    ],
    listings: [
      {
        slug: "joes-diner",
        title: "Joe's Diner",
        meta: "Breakfast all day, coffee that keeps coming.",
        category: "eat",
        order: 1,
        address: "1245 Broadway, New York, NY",
        links: [
          { type: "phone", value: "+1 607 247 8870" },
          { type: "website", value: "joesdiner.example.com" },
        ],
        body: [
          "Joe's has been on the corner since 1974 and has not changed the menu once.",
          "Come for the pancakes. Stay because nobody will rush you out.",
        ],
      },
      {
        slug: "la-pentola",
        title: "La Pentola",
        meta: "A small Italian kitchen with eleven tables.",
        category: "italian",
        order: 2,
        address: "9 Mercer Street, New York, NY",
        links: [{ type: "email", value: "hello@lapentola.example.com" }],
        body: [
          "Everything is made that morning, so the menu is short and it changes.",
          "Book ahead at the weekend — eleven tables go quickly.",
        ],
      },
      // A second published listing in "Eat", so a listing page actually has
      // something to show under "More like this".
      {
        slug: "the-kettle",
        title: "The Kettle",
        meta: "Tea, toast and a newspaper nobody has finished.",
        category: "eat",
        order: 2,
        address: "4 Bank Street, New York, NY",
        links: [{ type: "phone", value: "+1 607 555 0134" }],
        body: ["Open from six. Closed the moment the bread runs out."],
      },
      {
        slug: "the-quiet-hotel",
        title: "The Quiet Hotel",
        meta: "Fourteen rooms, no lobby music.",
        category: "stay",
        order: 3,
        address: "30 Grand Street, New York, NY",
        links: [{ type: "website", value: "quiethotel.example.com" }],
        body: ["Fourteen rooms above a bookshop. Breakfast is included."],
      },
      // A draft on purpose: it must never appear on a public page, and having
      // one in the sample data is how that stays obvious.
      {
        slug: "not-open-yet",
        title: "Not Open Yet",
        meta: "Still being written.",
        category: "eat",
        order: 4,
        draft: true,
        body: ["This one is a draft and should not be visible to a visitor."],
      },
    ],
  },
  {
    subdomain: "beta",
    name: "Beta Directory",
    categories: [
      { slug: "eat", name: "Food", description: "Beta's own food list." },
      { slug: "trades", name: "Trades", description: "People who fix things." },
    ],
    listings: [
      {
        slug: "joes-diner",
        title: "Joe's Diner (Beta)",
        // Deliberately the same address as Alpha's. Two sites sharing one is
        // ordinary, and it used to be refused — this is the proof it is not.
        meta: "A different Joe, on a different site.",
        category: "eat",
        order: 1,
        body: ["Same address as Alpha's Joe's Diner, and a different place."],
      },
      {
        slug: "morris-electrical",
        title: "Morris Electrical",
        meta: "Rewiring, sockets, and the fuse box nobody wants to look at.",
        category: "trades",
        order: 2,
        address: "12 Fore Street, Exeter",
        links: [{ type: "phone", value: "+44 1392 000000" }],
        body: ["Twenty years in the trade. Call before nine and you get today."],
      },
    ],
  },
]

/**
 * Beta gets enough listings to need a second page. Otherwise the pagination is
 * a control nobody can look at without hand-entering a dozen rows first, which
 * is the exact thing this script exists to avoid.
 */
const fillers = [
  "Ashby Plumbing",
  "Bright Windows",
  "Castle Roofing",
  "Dean & Sons Joinery",
  "Elm Street Locksmith",
  "Fairview Tiling",
  "Gable Chimney Sweep",
  "Harbour Painting",
  "Ingram Flooring",
  "Juniper Landscaping",
  "Kestrel Guttering",
]

sites[1].listings.push(
  ...fillers.map((title, index) => ({
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    title,
    meta: "One of the trades on Beta's list.",
    category: "trades",
    order: 10 + index,
    body: [`${title} has been on this list since the day it was made.`],
  }))
)

await main()

async function main() {
  await loadEnv(path.join(root, ".env.local"))

  const url = process.env.CUSTOM_SHELL_DATABASE_URL
  if (!url) {
    throw new Error(
      "No CUSTOM_SHELL_DATABASE_URL. Run npm run db:setup first, or set it in .env.local."
    )
  }

  // **Development only, and checked rather than trusted.** This upserts on the
  // subdomains `alpha` and `beta`, so pointed at a real deployment it would
  // rename and refill a live site that happened to use one of those names.
  // Nobody would do that on purpose; somebody will do it with the wrong
  // `.env.local` loaded.
  const host = new URL(url).hostname
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `Refusing to seed sample content into ${host}. This script is for a local database only.`
    )
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const ownerId = await sampleOwner(client)
    for (const site of sites) {
      const siteId = await upsertSite(client, ownerId, site)
      const categoryIds = await upsertCategories(client, siteId, site.categories)
      await upsertListings(client, siteId, categoryIds, site.listings)
      console.log(
        `${site.name}: ${site.listings.length} listings, ${site.categories.length} categories`
      )
    }
    // The port is read rather than written down: local-apps.json is the only
    // place an app's port is assigned.
    const ports = JSON.parse(
      await readFile(path.join(root, "../../local-apps.json"), "utf8")
    )
    console.log(
      `\nOpen ${sites
        .map((site) => `http://${site.subdomain}.localhost:${ports.cms}/directory`)
        .join(" and ")}`
    )
  } finally {
    await client.end()
  }
}

/**
 * Whoever is actually using this database: the owner of its oldest site, and
 * failing that its oldest admin.
 *
 * Not simply "the oldest admin" — a database seeded with demo people has admins
 * in it who have never signed in, and handing the samples to one of those puts
 * them somewhere nobody is looking. The oldest site is the one the real admin
 * was given on their first sign-in.
 */
async function sampleOwner(client) {
  const { rows } = await client.query(
    `select coalesce(
       (select user_id from workspaces where user_id is not null order by created_at limit 1),
       (select id from users where role = 'admin' order by created_at limit 1)
     ) as id`
  )
  const id = rows[0]?.id
  if (!id) {
    throw new Error(
      "No admin account to give the sample sites to. Run npm run db:setup first."
    )
  }
  return id
}

/**
 * **A site's owner is not cosmetic.** A site with nobody's name on it is
 * invisible in the sidebar switcher: the switcher is drawn from
 * `loadShellBootstrap`, which lists only the sites the reader made — so an
 * ownerless one appears on the Sites screen and cannot be switched to. Owning
 * them is the difference between sample data you can work with and sample data
 * you can only look at.
 */
async function upsertSite(client, ownerId, site) {
  const { rows } = await client.query(
    `insert into workspaces (id, user_id, name, subdomain, settings, created_at, updated_at)
     values (gen_random_uuid()::text, $1, $2, $3, '{}'::jsonb, now(), now())
     on conflict (subdomain) do update
       set name = excluded.name,
           user_id = excluded.user_id,
           updated_at = now()
     returning id`,
    [ownerId, site.name, site.subdomain]
  )
  return rows[0].id
}

async function upsertCategories(client, siteId, categories) {
  const ids = new Map()

  // Parents first, so a child always has something to hang off.
  for (const pass of [0, 1]) {
    for (const category of categories) {
      if ((pass === 0) !== !category.parent) continue

      const { rows } = await client.query(
        `insert into categories
           (id, workspace_id, name, slug, description, parent_id, display_order, created_at, updated_at)
         values (gen_random_uuid()::text, $1, $2, $3, $4, $5, 0, now(), now())
         on conflict (workspace_id, slug) do update
           set name = excluded.name,
               description = excluded.description,
               parent_id = excluded.parent_id,
               updated_at = now()
         returning id`,
        [
          siteId,
          category.name,
          category.slug,
          category.description ?? "",
          category.parent ? ids.get(category.parent) : null,
        ]
      )
      ids.set(category.slug, rows[0].id)
    }
  }

  return ids
}

async function upsertListings(client, siteId, categoryIds, listings) {
  for (const listing of listings) {
    const { rows } = await client.query(
      `insert into directory_listings
         (id, workspace_id, title, slug, meta_description, status, display_order,
          featured_image, contact_links, body, created_at, updated_at)
       values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, '', $7::jsonb, $8::jsonb, now(), now())
       on conflict (workspace_id, slug) do update
         set title = excluded.title,
             meta_description = excluded.meta_description,
             status = excluded.status,
             display_order = excluded.display_order,
             contact_links = excluded.contact_links,
             body = excluded.body,
             updated_at = now()
       returning id`,
      [
        siteId,
        listing.title,
        listing.slug,
        listing.meta,
        listing.draft ? "draft" : "published",
        listing.order,
        JSON.stringify(contactLinks(listing)),
        JSON.stringify(body(listing.body)),
      ]
    )
    const listingId = rows[0].id

    const categoryId = categoryIds.get(listing.category)
    if (!categoryId) continue

    await client.query(
      `insert into category_relationships
         (id, workspace_id, category_id, content_type, content_id, is_primary, created_at)
       values (gen_random_uuid()::text, $1, $2, 'directory_listing', $3, true, now())
       on conflict (category_id, content_type, content_id) do nothing`,
      [siteId, categoryId, listingId]
    )
  }
}

/** The shape `lib/directory/contact-links.ts` cleans and the page draws. */
function contactLinks(listing) {
  return {
    address: listing.address ?? "",
    menuLinks: (listing.links ?? []).map((link, index) => ({
      id: `${listing.slug}-link-${index}`,
      type: link.type,
      label: "",
      value: link.value,
    })),
    socialLinks: [],
  }
}

/** The editor's document shape, which is what the body column holds. */
function body(paragraphs) {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  }
}

async function loadEnv(file) {
  if (!existsSync(file)) return

  for (const rawLine of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separator = line.indexOf("=")
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}
