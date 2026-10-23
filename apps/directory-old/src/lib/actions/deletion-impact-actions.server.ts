import { sql } from "drizzle-orm"

import {
  isDeletionImpactRequest,
  type DeletionImpactRequest,
  type DestructiveImpact,
  type DestructiveImpactResult,
} from "@/lib/actions/deletion-impact-contract"
import { db } from "@/lib/db"
import { requireAdmin, requireSiteOwnership } from "@/lib/db/helpers"
import { UUID_REGEX } from "@/lib/utils/validation"

function count(value: unknown) {
  return Number(value) || 0
}

export async function getDeletionImpactActionImpl(input: DeletionImpactRequest): Promise<DestructiveImpactResult> {
  try {
    if (!isDeletionImpactRequest(input)) {
      return { data: null, error: "Invalid deletion target" }
    }

    const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))]
    if (!ids.length || ids.length > 100) {
      return { data: null, error: "Invalid deletion target" }
    }

    if (input.target === "user") {
      await requireAdmin()
      const userIdList = sql.join(ids.map((id) => sql`${id}`), sql`, `)
      const result = await db.execute<{
        target_count: number
        site_count: number
        page_count: number
        listing_count: number
        product_count: number
        order_count: number
        contact_count: number
        media_count: number
      }>(sql`
        with owned_sites as materialized (
          select id from sites where user_id in (${userIdList})
        )
        select
          (select count(*)::int from users where id in (${userIdList})) as target_count,
          (select count(*)::int from owned_sites) as site_count,
          (select count(*)::int from pages where site_id in (select id from owned_sites)) as page_count,
          (select count(*)::int from directory where site_id in (select id from owned_sites)) as listing_count,
          (select count(*)::int from products where site_id in (select id from owned_sites)) as product_count,
          (select count(*)::int from product_orders where site_id in (select id from owned_sites)) as order_count,
          (select count(*)::int from newsletter_contacts where site_id in (select id from owned_sites)) as contact_count,
          (select count(*)::int from media where user_id in (${userIdList})) as media_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "User not found or access denied" }
      return {
        data: [
          { label: "owned sites", count: count(row.site_count) },
          { label: "pages on owned sites", count: count(row.page_count) },
          { label: "listings on owned sites", count: count(row.listing_count) },
          { label: "products on owned sites", count: count(row.product_count) },
          { label: "order records on owned sites", count: count(row.order_count) },
          { label: "newsletter contacts on owned sites", count: count(row.contact_count) },
          { label: "owned media files", count: count(row.media_count) },
        ],
        error: null,
      }
    }

    if (!UUID_REGEX.test(input.siteId) || ids.some((id) => !UUID_REGEX.test(id))) {
      return { data: null, error: "Invalid deletion target" }
    }
    await requireSiteOwnership(input.siteId)
    const idList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
    let impact: DestructiveImpact[]

    if (input.target === "ai-automation") {
      const result = await db.execute<{ target_count: number; run_count: number; step_count: number; source_count: number }>(sql`
        select
          (select count(*)::int from site_automations where site_id = ${input.siteId}::uuid and id in (${idList})) as target_count,
          (select count(*)::int from site_automation_runs where automation_id in (${idList})) as run_count,
          (select count(*)::int from site_automation_run_steps where run_id in (select id from site_automation_runs where automation_id in (${idList}))) as step_count,
          (select count(*)::int from site_automation_source_states where automation_id in (${idList})) as source_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "Automation not found or access denied" }
      impact = [
        { label: "automation runs", count: count(row.run_count) },
        { label: "node run records", count: count(row.step_count) },
        { label: "scraped-source states", count: count(row.source_count) },
      ]
    } else if (input.target === "newsletter-automation") {
      const result = await db.execute<{ target_count: number; step_count: number; enrollment_count: number }>(sql`
        select
          (select count(*)::int from email_automations where site_id = ${input.siteId}::uuid and id in (${idList})) as target_count,
          (select count(*)::int from email_automation_steps where automation_id in (${idList})) as step_count,
          (select count(*)::int from email_automation_enrollments where automation_id in (${idList})) as enrollment_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "Automation not found or access denied" }
      impact = [
        { label: "automation steps", count: count(row.step_count) },
        { label: "contact enrollments", count: count(row.enrollment_count) },
      ]
    } else if (input.target === "saved-collection") {
      const result = await db.execute<{ target_count: number; saved_count: number }>(sql`
        select
          (select count(*)::int from directory_save_collections where site_id = ${input.siteId}::uuid and id in (${idList})) as target_count,
          (select count(*)::int from directory_save_items where site_id = ${input.siteId}::uuid and collection_id in (${idList})) as saved_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "Saved folder not found or access denied" }
      impact = [{ label: "saved listings", count: count(row.saved_count) }]
    } else if (input.target === "sponsor") {
      const result = await db.execute<{ target_count: number; analytics_count: number; portal_count: number }>(sql`
        select
          (select count(*)::int from sponsors where site_id = ${input.siteId}::uuid and id in (${idList})) as target_count,
          (select count(*)::int from sponsor_daily_analytics where site_id = ${input.siteId}::uuid and sponsor_id in (${idList})) as analytics_count,
          (select count(*)::int from sponsor_portal_links where site_id = ${input.siteId}::uuid and sponsor_id in (${idList})) as portal_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "Sponsor not found or access denied" }
      impact = [
        { label: "analytics records", count: count(row.analytics_count) },
        { label: "sponsor portal links", count: count(row.portal_count) },
      ]
    } else if (input.target === "listing") {
      const result = await db.execute<{
        target_count: number
        saved_count: number
        claim_count: number
        featured_count: number
      }>(sql`
        select
          (select count(*)::int from directory where site_id = ${input.siteId}::uuid and id in (${idList})) as target_count,
          (select count(*)::int from directory_save_items where site_id = ${input.siteId}::uuid and directory_id in (${idList})) as saved_count,
          (select count(*)::int from directory_claims where site_id = ${input.siteId}::uuid and directory_id in (${idList})) as claim_count,
          (select count(*)::int from directory_featured_entitlements where site_id = ${input.siteId}::uuid and directory_id in (${idList}) and status = 'active' and ends_at > now()) as featured_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "Listing not found or access denied" }
      impact = [
        { label: "saved-list references", count: count(row.saved_count) },
        { label: "claims", count: count(row.claim_count) },
        { label: "active Featured placements", count: count(row.featured_count) },
      ]
    } else if (input.target === "product") {
      const result = await db.execute<{ target_count: number; order_count: number }>(sql`
        select
          (select count(*)::int from products where site_id = ${input.siteId}::uuid and id in (${idList})) as target_count,
          (select count(*)::int from product_orders where site_id = ${input.siteId}::uuid and product_id in (${idList})) as order_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "Product not found or access denied" }
      impact = [{ label: "order records", count: count(row.order_count) }]
    } else if (input.target === "category") {
      const result = await db.execute<{
        target_count: number
        descendant_count: number
        assignment_count: number
      }>(sql`
        with recursive affected as (
          select id from categories where site_id = ${input.siteId}::uuid and id in (${idList})
          union
          select child.id from categories child join affected parent on child.parent_id = parent.id where child.site_id = ${input.siteId}::uuid
        )
        select
          (select count(*)::int from categories where site_id = ${input.siteId}::uuid and id in (${idList})) as target_count,
          greatest((select count(*)::int from affected) - ${ids.length}, 0)::int as descendant_count,
          (select count(*)::int from category_relationships where category_id in (select id from affected)) as assignment_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "Category not found or access denied" }
      impact = [
        { label: "child categories", count: count(row.descendant_count) },
        { label: "content assignments", count: count(row.assignment_count) },
      ]
    } else if (input.target === "segment") {
      const result = await db.execute<{ target_count: number; membership_count: number }>(sql`
        select
          (select count(*)::int from newsletter_segments where site_id = ${input.siteId}::uuid and id in (${idList})) as target_count,
          (select count(*)::int from newsletter_segment_contacts where segment_id in (${idList})) as membership_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "Segment not found or access denied" }
      impact = [{ label: "contact memberships", count: count(row.membership_count) }]
    } else if (input.target === "form" || input.target === "form-delete") {
      const result = await db.execute<{ target_count: number; submission_count: number }>(sql`
        select
          (select count(*)::int from guided_forms where site_id = ${input.siteId}::uuid and id in (${idList})) as target_count,
          (select count(*)::int from guided_form_submissions where site_id = ${input.siteId}::uuid and form_id in (${idList})) as submission_count
      `)
      const row = result.rows[0]
      if (count(row?.target_count) !== ids.length) return { data: null, error: "Form not found or access denied" }
      // Archiving keeps the submissions; deleting takes them with it.
      impact = [{
        label: input.target === "form" ? "existing submissions retained" : "submissions deleted",
        count: count(row.submission_count),
      }]
    } else if (input.target === "site") {
      if (ids.length !== 1 || ids[0] !== input.siteId) return { data: null, error: "Invalid site deletion target" }
      const result = await db.execute<{
        page_count: number
        listing_count: number
        product_count: number
        order_count: number
        contact_count: number
        media_count: number
        form_count: number
      }>(sql`
        select
          (select count(*)::int from pages where site_id = ${input.siteId}::uuid) as page_count,
          (select count(*)::int from directory where site_id = ${input.siteId}::uuid) as listing_count,
          (select count(*)::int from products where site_id = ${input.siteId}::uuid) as product_count,
          (select count(*)::int from product_orders where site_id = ${input.siteId}::uuid) as order_count,
          (select count(*)::int from newsletter_contacts where site_id = ${input.siteId}::uuid) as contact_count,
          (select count(*)::int from media where site_id = ${input.siteId}::uuid) as media_count,
          (select count(*)::int from guided_forms where site_id = ${input.siteId}::uuid) as form_count
      `)
      const row = result.rows[0]
      impact = [
        { label: "pages", count: count(row?.page_count) },
        { label: "listings", count: count(row?.listing_count) },
        { label: "products", count: count(row?.product_count) },
        { label: "order records", count: count(row?.order_count) },
        { label: "newsletter contacts", count: count(row?.contact_count) },
        { label: "media files", count: count(row?.media_count) },
        { label: "forms", count: count(row?.form_count) },
      ]
    } else {
      return { data: null, error: "Invalid deletion target" }
    }

    return { data: impact, error: null }
  } catch (error) {
    console.error("getDeletionImpactAction error:", error)
    return { data: null, error: "Unable to load deletion impact" }
  }
}

export type { DeletionImpactRequest }
