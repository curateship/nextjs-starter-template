import { sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import type { SiteSettings } from "@/lib/sites/site-settings"
import type { SiteStatus } from "@/lib/sites/site-status"

/**
 * The sites this one deployment serves.
 *
 * An app-owned table, so it lives here and never in the shell's
 * `src/server/schema.ts` — an app that edits a shell file forks it and every
 * future shell merge argues about it. The matching SQL is
 * `drizzle/0045_cms_sites.sql`.
 *
 * Deliberately simpler than the directory app's version of this table. There is
 * no owner column, because an admin manages every site here; no template flag,
 * because copying a site is not in this version; and nothing about DNS
 * verification or wiring a domain into the server, because a custom domain here
 * is a field somebody types and a DNS record they point by hand.
 */
export const sites = pgTable(
  "sites",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** What the admin calls this site; also its title until one is set. */
    name: varchar("name", { length: 120 }).notNull(),
    /** A note for whoever runs the deployment. Visitors never see it. */
    description: varchar("description", { length: 500 }).notNull().default(""),
    /** The label in front of the base domain, e.g. `alpha` in alpha.example.com. */
    subdomain: varchar("subdomain", { length: 63 }).notNull(),
    /**
     * A domain of the site's own, stored bare — no scheme, no port, no `www.`
     * — because that is the shape an incoming host is reduced to before it is
     * matched. Empty means the site answers only on its subdomain.
     */
    customDomain: varchar("custom_domain", { length: 253 })
      .notNull()
      .default(""),
    /**
     * `active` and `draft` both answer; `inactive` looks like it never existed.
     * Draft is deliberately reachable — it is how a site is looked at before
     * anybody is told about it.
     */
    status: varchar("status", { length: 20 })
      .$type<SiteStatus>()
      .notNull()
      .default("draft"),
    /** Everything the site looks like. See `@/lib/sites/site-settings`. */
    settings: jsonb("settings").$type<SiteSettings>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("sites_subdomain_key").on(table.subdomain),
    // Unique only where there is one, so every site without a custom domain
    // can keep the empty string without colliding with the others.
    uniqueIndex("sites_custom_domain_key")
      .on(table.customDomain)
      .where(sql`${table.customDomain} <> ''`),
    index("ix_sites_status").on(table.status),
    index("ix_sites_created_at").on(table.createdAt),
    check(
      "sites_status_check",
      sql`${table.status} in ('active', 'inactive', 'draft')`
    ),
    // The same rule the form applies, kept here too so nothing that reaches
    // the database by another route can leave an address that cannot resolve.
    check(
      "sites_subdomain_check",
      sql`${table.subdomain} ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' and length(${table.subdomain}) >= 3`
    ),
  ]
)

export type SiteRow = typeof sites.$inferSelect
