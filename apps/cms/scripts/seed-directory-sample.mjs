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
    // Three rows, one under the other, and the third is deliberately pointed at
    // a category with nothing published in it — the page leaves it out
    // altogether, which is the behaviour worth being able to see.
    frontPage: [
      {
        heading: "New this week",
        intro: "The places added most recently.",
        sort: "newest",
        listingCount: 3,
      },
      { heading: "Featured places", sort: "featured", listingCount: 3 },
      {
        heading: "Nightlife",
        category: "nightlife",
        sort: "newest",
        listingCount: 3,
      },
      // A hand-picked row of four categories, and "nightlife" has nothing in
      // it — so three cards draw and the fourth is left off, which is the rule
      // worth being able to see.
      {
        heading: "Start somewhere",
        intro: "Pick a category and go from there.",
        kind: "categories",
        categorySource: "picked",
        categories: ["eat", "italian", "stay", "nightlife"],
        listingCount: 12,
      },
    ],
    // Beta's browse page has no cards; Alpha's does, from its top-level
    // categories, so both states are on screen without changing a setting.
    browseCategories: { enabled: true, source: "top-level" },
    publicSettings: {
      publicNavigation: [
        { label: "Home", href: "/" },
        { label: "Directory", href: "/directory" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
      publicFooter: [
        { label: "Directory", href: "/directory" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ],
      publicFooterCopyright: "© 2026 Alpha Guide",
    },
    pages: [
      [
        "/about",
        "About Alpha",
        "Alpha Guide collects dependable local places.",
      ],
      [
        "/contact",
        "Contact Alpha",
        "Send Alpha Guide your local recommendations.",
      ],
      ["/privacy", "Privacy", "Alpha Guide keeps its privacy promise simple."],
      ["/terms", "Terms", "The terms for using Alpha Guide."],
    ],
    // Two sections of invented fields, so the Listing fields screen, the
    // extra groups on the listing form and the extra sections on a public
    // page all have something real in them.
    customSections: [
      {
        slug: "the_food",
        name: "The food",
        layout: "two-column",
        fields: [
          { key: "kitchen", label: "Kitchen", type: "text" },
          { key: "price", label: "Typical price", type: "number" },
          {
            key: "style",
            label: "Style",
            type: "select",
            options: [
              { id: "casual", label: "Casual", value: "casual" },
              { id: "smart", label: "Smart", value: "smart" },
            ],
          },
          { key: "vegan", label: "Vegan options", type: "toggle" },
          { key: "known_for", label: "Known for", type: "tags" },
          { key: "menu_photo", label: "Menu photo", type: "image" },
        ],
      },
      {
        slug: "whats_on",
        name: "What's on",
        layout: "stack",
        fields: [
          {
            key: "events",
            label: "Regular events",
            type: "repeater",
            fields: [
              { key: "name", label: "Event", type: "text" },
              { key: "when", label: "When", type: "text" },
            ],
          },
        ],
      },
    ],
    categories: [
      {
        slug: "eat",
        name: "Eat",
        description: "Places to eat and drink.",
        meta: "Independent places to eat and drink, reviewed and mapped.",
        image:
          "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
      },
      {
        slug: "italian",
        name: "Italian",
        parent: "eat",
        description: "Pasta, pizza and the rest of it.",
        image:
          "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
      },
      { slug: "stay", name: "Stay", description: "Somewhere to sleep." },
      // Nothing is ever put in this one, on purpose: it is what the third home
      // page row filters to, so the empty-row rule is on screen.
      {
        slug: "nightlife",
        name: "Nightlife",
        description: "Nowhere yet — this category is deliberately empty.",
      },
    ],
    listings: [
      {
        slug: "joes-diner",
        title: "Joe's Diner",
        meta: "Breakfast all day, coffee that keeps coming.",
        rating: 4.5,
        category: "eat",
        order: 1,
        featuredImage:
          "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80",
        gallery: [
          "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1200&q=80",
        ],
        hours: weekdayHours("07:00", "21:00", {
          saturday: { open: "08:00", close: "22:00" },
          sunday: { open: "08:00", close: "20:00" },
        }),
        latitude: 40.7473,
        longitude: -73.9887,
        address: "1245 Broadway, New York, NY",
        links: [
          { type: "phone", value: "+1 607 247 8870" },
          { type: "website", value: "joesdiner.example.com" },
        ],
        body: [
          "Joe's has been on the corner since 1974 and has not changed the menu once.",
          "Come for the pancakes. Stay because nobody will rush you out.",
        ],
        custom: {
          the_food: {
            kitchen: "American diner",
            price: 18,
            style: "casual",
            vegan: true,
            known_for: ["Pancakes", "Bottomless coffee"],
          },
          whats_on: {
            events: [
              { name: "Quiz night", when: "Tuesdays, 8pm" },
              { name: "Pie of the week", when: "Fridays" },
            ],
          },
        },
      },
      {
        slug: "la-pentola",
        title: "La Pentola",
        meta: "A small Italian kitchen with eleven tables.",
        category: "italian",
        order: 2,
        gallery: [
          "https://images.unsplash.com/photo-1579684947550-22e945225d9a?auto=format&fit=crop&w=1200&q=80",
        ],
        hours: weekdayHours("17:00", "23:00", {
          monday: null,
          sunday: null,
        }),
        latitude: 40.7203,
        longitude: -74.0011,
        address: "9 Mercer Street, New York, NY",
        links: [{ type: "email", value: "hello@lapentola.example.com" }],
        body: [
          "Everything is made that morning, so the menu is short and it changes.",
          "Book ahead at the weekend — eleven tables go quickly.",
        ],
        // Half a section on purpose: only what is filled in should show.
        custom: { the_food: { kitchen: "Northern Italian", vegan: false } },
      },
      // A second published listing in "Eat", so a listing page actually has
      // something to show under "More like this".
      {
        slug: "the-kettle",
        title: "The Kettle",
        meta: "Tea, toast and a newspaper nobody has finished.",
        category: "eat",
        order: 2,
        // No coordinates on purpose. A directory always has a few of these,
        // and the map has to leave them off without looking broken.
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
        latitude: 40.7223,
        longitude: -74.0031,
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
    // No rows, so Beta's home page stays the platform's own — the other half of
    // the picture.
    frontPage: [],
    publicSettings: {
      publicNavigation: [
        { label: "Browse", href: "/directory" },
        { label: "Food", href: "/directory/category/eat" },
        { label: "Trades", href: "/directory/category/trades" },
      ],
      publicFooter: [
        { label: "Browse all", href: "/directory" },
        { label: "Terms", href: "/terms" },
      ],
      publicFooterCopyright: "© 2026 Beta Directory",
    },
    pages: [["/terms", "Beta terms", "The terms for using Beta Directory."]],
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
        body: [
          "Twenty years in the trade. Call before nine and you get today.",
        ],
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

/**
 * Alpha gets a handful of cafés with real coordinates, in two tight knots a few
 * blocks apart. Without them the map has three pins on it and nothing to look
 * at — the whole question the map answers is "what is near what", and one pin
 * per neighbourhood cannot show that.
 */
/** A title turned into the address it lives at, the same way twice. */
function slugFor(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

const alphaCafes = [
  ["Corner Cup", 40.7461, -73.9902],
  ["Ninth Street Roasters", 40.7468, -73.9875],
  ["The Long Black", 40.7455, -73.9889],
  ["Paper Cup Coffee", 40.7479, -73.9868],
  ["Bench & Bean", 40.7452, -73.9915],
  ["Mercer Espresso", 40.7211, -74.0002],
  ["Greene Street Coffee", 40.7196, -74.0019],
  ["Small Hours", 40.7218, -73.9994],
  ["The Reading Room", 40.7189, -74.0034],
]

sites[0].listings.push(
  ...alphaCafes.map(([title, latitude, longitude], index) => ({
    slug: slugFor(title),
    title,
    meta: "Coffee, and somewhere to sit with it.",
    category: "eat",
    order: 20 + index,
    latitude,
    longitude,
    address: `${title}, New York, NY`,
    body: [`${title} opens early and does one thing properly.`],
  }))
)

sites[1].listings.push(
  ...fillers.map((title, index) => ({
    slug: slugFor(title),
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
      // Alpha offers the map, Beta does not, so both states are on screen
      // without changing a setting. The key it needs is a secret and is never
      // seeded: paste one in Settings → Directory → Map view.
      await upsertDirectorySettings(client, siteId, site.subdomain === "alpha")
      await upsertCustomSections(client, siteId, site.customSections ?? [])
      const categoryIds = await upsertCategories(
        client,
        siteId,
        site.categories
      )
      await upsertFrontPageSections(
        client,
        siteId,
        categoryIds,
        site.frontPage ?? []
      )
      await upsertBrowseCategories(
        client,
        siteId,
        categoryIds,
        site.browseCategories
      )
      const listingIds = await upsertListings(
        client,
        siteId,
        categoryIds,
        site.listings
      )
      await upsertWrittenPages(client, siteId, site.pages)
      if (site.subdomain === "alpha") {
        await upsertFeaturedSample(
          client,
          siteId,
          ownerId,
          listingIds.get("joes-diner")
        )
      }
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
        .map(
          (site) => `http://${site.subdomain}.localhost:${ports.cms}/directory`
        )
        .join(" and ")}`
    )
  } finally {
    await client.end()
  }
}

/**
 * The extra fields this site invents. Keyed on the slug, which is also the key
 * every listing's answers are stored under — so a rerun updates the same
 * section rather than making a second one beside it.
 */
async function upsertCustomSections(client, siteId, sections) {
  for (const [index, section] of sections.entries()) {
    await client.query(
      `insert into directory_custom_sections
         (id, workspace_id, name, slug, layout, fields, display_order, created_at, updated_at)
       values (gen_random_uuid()::text, $1, $2, $3, $4, $5::jsonb, $6, now(), now())
       on conflict (workspace_id, slug) do update
         set name = excluded.name,
             layout = excluded.layout,
             fields = excluded.fields,
             display_order = excluded.display_order,
             updated_at = now()`,
      [
        siteId,
        section.name,
        section.slug,
        section.layout ?? "stack",
        JSON.stringify(
          section.fields.map((field) => ({ options: [], ...field }))
        ),
        index,
      ]
    )
  }
}

async function upsertDirectorySettings(client, siteId, mapEnabled) {
  await client.query(
    `insert into directory_settings
       (workspace_id, map_enabled, created_at, updated_at)
     values ($1, $2, now(), now())
     on conflict (workspace_id) do update
       set map_enabled = excluded.map_enabled,
           updated_at = now()`,
    [siteId, mapEnabled]
  )
}

/** The row of category cards at the top of this site's browse page, if any. */
async function upsertBrowseCategories(client, siteId, categoryIds, choice) {
  await client.query(
    `update directory_settings
        set browse_categories_enabled = $2,
            browse_category_source = $3,
            browse_picked_category_ids = $4::jsonb,
            updated_at = now()
      where workspace_id = $1`,
    [
      siteId,
      Boolean(choice?.enabled),
      choice?.source ?? "top-level",
      JSON.stringify(
        (choice?.categories ?? []).flatMap((slug) => {
          const id = categoryIds.get(slug)
          return id ? [id] : []
        })
      ),
    ]
  )
}

/**
 * The rows this site's home page is made of.
 *
 * Replaced wholesale rather than matched up one by one: there is no natural key
 * on a row, and a rerun that added a second "New this week" beside the first
 * would break the cap after two goes.
 */
async function upsertFrontPageSections(client, siteId, categoryIds, rows) {
  await client.query(
    `delete from directory_front_page_sections where workspace_id = $1`,
    [siteId]
  )
  for (const [index, row] of rows.entries()) {
    await client.query(
      `insert into directory_front_page_sections
         (id, workspace_id, display_order, heading, intro, kind, category_source,
          picked_category_ids, category_id, sort, listing_count, layout,
          created_at, updated_at)
       values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9,
               $10, $11, now(), now())`,
      [
        siteId,
        index,
        row.heading,
        row.intro ?? "",
        row.kind ?? "listings",
        row.categorySource ?? "top-level",
        JSON.stringify(
          (row.categories ?? []).flatMap((slug) => {
            const id = categoryIds.get(slug)
            return id ? [id] : []
          })
        ),
        row.category ? (categoryIds.get(row.category) ?? null) : null,
        row.sort ?? "newest",
        row.listingCount ?? 8,
        row.layout ?? "grid",
      ]
    )
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
     values (gen_random_uuid()::text, $1, $2, $3, $4::jsonb, now(), now())
     on conflict (subdomain) do update
       set name = excluded.name,
           user_id = excluded.user_id,
           settings = workspaces.settings || excluded.settings,
           updated_at = now()
     returning id`,
    [ownerId, site.name, site.subdomain, JSON.stringify(site.publicSettings)]
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
           (id, workspace_id, name, slug, description, meta_description,
            featured_image, parent_id, display_order, created_at, updated_at)
         values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, 0, now(), now())
         on conflict (workspace_id, slug) do update
           set name = excluded.name,
               description = excluded.description,
               meta_description = excluded.meta_description,
               featured_image = excluded.featured_image,
               parent_id = excluded.parent_id,
               updated_at = now()
         returning id`,
        [
          siteId,
          category.name,
          category.slug,
          category.description ?? "",
          category.meta ?? "",
          category.image ?? "",
          category.parent ? ids.get(category.parent) : null,
        ]
      )
      ids.set(category.slug, rows[0].id)
    }
  }

  return ids
}

async function upsertListings(client, siteId, categoryIds, listings) {
  const ids = new Map()
  for (const listing of listings) {
    const { rows } = await client.query(
      `insert into directory_listings
         (id, workspace_id, title, slug, meta_description, rating, status,
          display_order, featured_image, gallery, hours, latitude, longitude,
          contact_links, body, custom_values, created_at, updated_at)
       values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8,
               $9::jsonb, $10::jsonb, $11, $12, $13::jsonb, $14::jsonb,
               $15::jsonb, now(), now())
       on conflict (workspace_id, slug) do update
         set title = excluded.title,
             meta_description = excluded.meta_description,
             rating = excluded.rating,
             status = excluded.status,
             display_order = excluded.display_order,
             featured_image = excluded.featured_image,
             gallery = excluded.gallery,
             hours = excluded.hours,
             latitude = excluded.latitude,
             longitude = excluded.longitude,
             contact_links = excluded.contact_links,
             body = excluded.body,
             custom_values = excluded.custom_values,
             updated_at = now()
       returning id`,
      [
        siteId,
        listing.title,
        listing.slug,
        listing.meta,
        listing.rating ?? null,
        listing.draft ? "draft" : "published",
        listing.order,
        listing.featuredImage ?? "",
        JSON.stringify(listing.gallery ?? []),
        JSON.stringify(listing.hours ?? {}),
        listing.latitude ?? null,
        listing.longitude ?? null,
        JSON.stringify(contactLinks(listing)),
        JSON.stringify(body(listing.body)),
        JSON.stringify(listing.custom ?? {}),
      ]
    )
    const listingId = rows[0].id
    ids.set(listing.slug, listingId)

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
  return ids
}

function weekdayHours(open, close, overrides = {}) {
  return {
    monday: { open, close },
    tuesday: { open, close },
    wednesday: { open, close },
    thursday: { open, close },
    friday: { open, close },
    saturday: { open, close },
    sunday: { open, close },
    ...overrides,
  }
}

/** One real-looking active placement makes its badge and sorting inspectable. */
async function upsertFeaturedSample(client, siteId, ownerId, listingId) {
  if (!listingId) return

  const claimResult = await client.query(
    `select id, user_id from directory_claims
     where listing_id = $1 and status = 'approved'
     limit 1`,
    [listingId]
  )
  let claim = claimResult.rows[0]
  if (!claim) {
    const inserted = await client.query(
      `insert into directory_claims
         (id, workspace_id, listing_id, user_id, contact_email, claimant_name,
          status, verified_at, reviewed_by_user_id, reviewed_at, created_at, updated_at)
       select gen_random_uuid()::text, $1, $2, u.id, u.email, u.name,
              'approved', now(), u.id, now(), now(), now()
       from users u where u.id = $3
       returning id, user_id`,
      [siteId, listingId, ownerId]
    )
    claim = inserted.rows[0]
  }
  if (!claim) return

  const planResult = await client.query(
    `select id from directory_featured_plans
     where workspace_id = $1 and name = 'Sample featured'
     order by created_at limit 1`,
    [siteId]
  )
  let planId = planResult.rows[0]?.id
  if (!planId) {
    const inserted = await client.query(
      `insert into directory_featured_plans
         (id, workspace_id, name, description, price_cents, currency,
          duration_days, priority, active, created_at, updated_at)
       values (gen_random_uuid()::text, $1, 'Sample featured',
               'Local sample used to inspect featured placement.', 2500,
               'usd', 14, 10, true, now(), now())
       returning id`,
      [siteId]
    )
    planId = inserted.rows[0]?.id
  }
  if (!planId) return

  await client.query(
    `insert into directory_featured_entitlements
       (id, workspace_id, listing_id, claim_id, buyer_user_id, plan_id,
        stripe_session_id, amount_total, currency, status, starts_at, ends_at,
        created_at, updated_at)
     values (gen_random_uuid()::text, $1, $2, $3, $4, $5,
             'dev_directory_featured_alpha_joes', 2500, 'usd', 'active',
             now(), now() + interval '14 days', now(), now())
     on conflict (stripe_session_id) do update
       set status = 'active',
           starts_at = now(),
           ends_at = now() + interval '14 days',
           updated_at = now()`,
    [siteId, listingId, claim.id, claim.user_id, planId]
  )
}

async function upsertWrittenPages(client, siteId, pages) {
  for (const [pagePath, title, text] of pages) {
    await client.query(
      `insert into written_pages
         (id, workspace_id, path, title, body, created_at, updated_at)
       values (gen_random_uuid()::text, $1, $2, $3, $4::jsonb, now(), now())
       on conflict (workspace_id, path) do update
         set title = excluded.title,
             body = excluded.body,
             updated_at = now()`,
      [siteId, pagePath, title, JSON.stringify(body([text]))]
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
