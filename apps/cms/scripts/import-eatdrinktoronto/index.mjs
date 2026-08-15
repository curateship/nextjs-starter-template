import { createHash, randomUUID } from "node:crypto"
import { lookup } from "node:dns/promises"
import { mkdir, writeFile } from "node:fs/promises"
import http from "node:http"
import https from "node:https"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import pg from "pg"

import {
  droppedBlocks,
  imageUrlsFromListing,
  isPrivateAddress,
  mergeDirectoryBlocks,
  safeSlug,
  stableJson,
  translateListing,
  validateCategoryTree,
} from "./translate.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const SOURCE_TYPE = "eatdrinktoronto"
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

await main()

async function main() {
  await loadEnv(path.join(root, ".env.local"))
  const options = parseArguments(process.argv.slice(2))
  const sourceUrl = process.env.DIRECTORY_SOURCE_DATABASE_URL
  const targetUrl = process.env.CUSTOM_SHELL_DATABASE_URL
  if (!sourceUrl)
    throw new Error(
      "Set DIRECTORY_SOURCE_DATABASE_URL to the old app's read-only database address."
    )
  if (!targetUrl)
    throw new Error(
      "Set CUSTOM_SHELL_DATABASE_URL to the CMS database address."
    )

  const source = new pg.Client({ connectionString: sourceUrl })
  const target = new pg.Client({ connectionString: targetUrl })
  const report = newReport(options)
  const dropped = {}
  let dryRunTransaction = false
  try {
    await source.connect()
    await target.connect()
    const sourceData = await readSource(source, options.sourceSite)
    validateCategoryTree(sourceData.categories)
    report.sourceCategories = sourceData.categories.length
    report.sourceListings = sourceData.listings.length
    report.sourcePublished = sourceData.listings.filter(
      (listing) => listing.status === "published"
    ).length
    report.sourceDrafts = report.sourceListings - report.sourcePublished

    const workspace = await targetWorkspace(target, options.site)
    if (options.dryRun) {
      await target.query("BEGIN READ ONLY")
      dryRunTransaction = true
    }
    const categoryIds = await importCategories(
      target,
      workspace.id,
      sourceData.categories,
      options.dryRun,
      report
    )
    const photoCache = new Map()

    for (const sourceListing of sourceData.listings) {
      try {
        const template = sourceData.templates.get(sourceListing.templateId)
        if (!template) {
          throw new Error(
            `The source template ${sourceListing.templateId} is missing.`
          )
        }
        const merged = mergeDirectoryBlocks(
          template,
          sourceListing.contentBlocks
        )
        const translated = translateListing(sourceListing, merged)
        if (!translated.title)
          throw new Error("The listing has no usable title.")
        translated.slug = safeSlug(translated.slug, translated.title)

        const sourceCategories =
          sourceData.relationships.get(sourceListing.id) ?? []
        const categoryLinks = sourceCategories
          .map((link) => ({
            categoryId: categoryIds.get(link.categoryId),
            isPrimary: link.isPrimary,
          }))
          .filter((link) => link.categoryId)

        const sourceFeaturedImage = translated.featuredImage
        const imageUrls = imageUrlsFromListing(sourceListing, merged)
        report.photoCandidates += imageUrls.length
        if (!options.dryRun) {
          const importedImages = new Map()
          for (const sourceUrl of imageUrls) {
            try {
              const photo = await importPhoto({
                target,
                workspace,
                sourceUrl,
                title: translated.title,
                cache: photoCache,
              })
              importedImages.set(sourceUrl, photo.url)
              if (photo.stored) report.photosStored += 1
              else report.photosReused += 1
            } catch (error) {
              report.photosFailed += 1
              report.photoErrors.push({
                sourceId: sourceListing.id,
                sourceUrl,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }
          translated.featuredImage =
            importedImages.get(sourceFeaturedImage) ?? ""
        } else {
          translated.featuredImage = ""
        }

        const result = await importListing({
          target,
          workspaceId: workspace.id,
          sourceId: sourceListing.id,
          translated,
          categoryLinks,
          dryRun: options.dryRun,
        })
        report[result.action] += 1

        const omitted = droppedBlocks(merged, sourceListing)
        if (omitted.openingHours.length) report.listingsWithHours += 1
        if (omitted.coordinates.length) report.listingsWithCoordinates += 1
        if (omitted.custom.length) report.listingsWithCustomBlocks += 1
        for (const block of omitted.openingHours)
          addDroppedKind(report, block.type)
        for (const block of omitted.coordinates)
          addDroppedKind(report, block.type ?? "coordinates")
        for (const block of omitted.custom) addDroppedKind(report, block.type)
        for (const block of omitted.unsupportedCore)
          addDroppedKind(report, block.type)
        if (
          omitted.openingHours.length ||
          omitted.coordinates.length ||
          omitted.custom.length ||
          omitted.unsupportedCore.length
        ) {
          dropped[result.id] = omitted
        }
      } catch (error) {
        report.skipped += 1
        report.errors.push({
          sourceId: sourceListing.id,
          title: sourceListing.title,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (dryRunTransaction) {
      await target.query("COMMIT")
      dryRunTransaction = false
    }
    report.finishedAt = new Date().toISOString()
    await writeReports(options.output, report, dropped)
    printReport(report, options.output)
    if (
      report.created + report.updated + report.skipped !==
      report.sourceListings
    ) {
      throw new Error(
        "The listing totals do not add up; the import report is incomplete."
      )
    }
    if (report.errors.length) {
      throw new Error(
        `${report.errors.length} source listing${report.errors.length === 1 ? " was" : "s were"} not imported. See report.json.`
      )
    }
  } catch (error) {
    if (dryRunTransaction) await target.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    await Promise.allSettled([source.end(), target.end()])
  }
}

function parseArguments(arguments_) {
  const result = {
    site: "",
    sourceSite: "",
    dryRun: false,
    output: path.join(root, "import-eatdrinktoronto-output"),
  }
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === "--") continue
    if (argument === "--dry-run") result.dryRun = true
    else if (argument === "--site") {
      result.site = optionValue(arguments_, index, argument)
      index += 1
    } else if (argument === "--source-site") {
      result.sourceSite = optionValue(arguments_, index, argument)
      index += 1
    } else if (argument === "--output") {
      result.output = path.resolve(optionValue(arguments_, index, argument))
      index += 1
    } else throw new Error(`Unknown option: ${argument}`)
  }
  if (!result.site)
    throw new Error(
      "Use --site <slug> to name the CMS site receiving the listings."
    )
  if (!result.sourceSite)
    throw new Error(
      "Use --source-site <id> to name the old app site being read."
    )
  return result
}

function optionValue(arguments_, index, option) {
  const value = arguments_[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} needs a value.`)
  }
  return value
}

function newReport(options) {
  return {
    dryRun: options.dryRun,
    sourceSite: options.sourceSite,
    targetSite: options.site,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    sourceCategories: 0,
    categoriesCreated: 0,
    categoriesReused: 0,
    categoriesUpdated: 0,
    sourceListings: 0,
    sourcePublished: 0,
    sourceDrafts: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    photoCandidates: 0,
    photosStored: 0,
    photosReused: 0,
    photosFailed: 0,
    listingsWithHours: 0,
    listingsWithCoordinates: 0,
    listingsWithCustomBlocks: 0,
    droppedByKind: {},
    photoErrors: [],
    errors: [],
  }
}

async function readSource(client, siteId) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
  try {
    const site = await client.query(
      "SELECT id FROM sites WHERE id = $1 LIMIT 1",
      [siteId]
    )
    if (!site.rowCount)
      throw new Error(`The old site ${siteId} does not exist.`)

    const categoryResult = await client.query(
      `
        SELECT id::text, title AS name, slug, COALESCE(meta_description, '') AS description,
               parent_id::text, display_order
        FROM categories WHERE site_id = $1 ORDER BY display_order, title
      `,
      [siteId]
    )
    const listingResult = await client.query(
      `
        SELECT id::text, template_id::text, title, slug, status,
               COALESCE(meta_description, '') AS meta_description, display_order,
               COALESCE(content_blocks, '{}'::jsonb) AS content_blocks,
               COALESCE(featured_image, '') AS featured_image,
               latitude, longitude
        FROM directory WHERE site_id = $1
        ORDER BY CASE WHEN status = 'published' THEN 0 ELSE 1 END,
                 display_order, created_at, id
      `,
      [siteId]
    )
    const templateResult = await client.query(
      `
        SELECT id::text, COALESCE(content_blocks, '{}'::jsonb) AS content_blocks
        FROM directory_templates WHERE site_id = $1
      `,
      [siteId]
    )
    const relationshipResult = await client.query(
      `
        SELECT relationship.content_id::text, relationship.category_id::text, relationship.is_primary
        FROM category_relationships relationship
        INNER JOIN directory listing ON listing.id = relationship.content_id
        WHERE listing.site_id = $1 AND relationship.content_type = 'directory'
      `,
      [siteId]
    )
    await client.query("COMMIT")

    const relationships = new Map()
    for (const row of relationshipResult.rows) {
      const current = relationships.get(row.content_id) ?? []
      current.push({
        categoryId: row.category_id,
        isPrimary: row.is_primary === true,
      })
      relationships.set(row.content_id, current)
    }
    return {
      categories: categoryResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        parentId: row.parent_id,
        displayOrder: Number(row.display_order) || 0,
      })),
      listings: listingResult.rows.map((row) => ({
        id: row.id,
        templateId: row.template_id,
        title: row.title,
        slug: row.slug,
        metaDescription: row.meta_description,
        status: row.status === "published" ? "published" : "draft",
        displayOrder: Number(row.display_order) || 0,
        contentBlocks: row.content_blocks,
        featuredImage: row.featured_image,
        latitude: row.latitude,
        longitude: row.longitude,
      })),
      templates: new Map(
        templateResult.rows.map((row) => [row.id, row.content_blocks])
      ),
      relationships,
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  }
}

async function targetWorkspace(client, slug) {
  const result = await client.query(
    "SELECT id, user_id FROM workspaces WHERE subdomain = $1 LIMIT 1",
    [slug]
  )
  const workspace = result.rows[0]
  if (!workspace) throw new Error(`The CMS site ${slug} does not exist.`)
  if (!workspace.user_id)
    throw new Error(`The CMS site ${slug} has no owner for imported media.`)
  return { id: workspace.id, userId: workspace.user_id }
}

async function importCategories(
  client,
  workspaceId,
  sourceCategories,
  dryRun,
  report
) {
  const existingResult = await client.query(
    "SELECT id, name, slug, description, parent_id, display_order FROM categories WHERE workspace_id = $1",
    [workspaceId]
  )
  const existingBySlug = new Map(
    existingResult.rows.map((row) => [row.slug, row])
  )
  const ids = new Map()

  if (!dryRun) await client.query("BEGIN")
  try {
    for (const category of sourceCategories) {
      const slug = safeSlug(category.slug, category.name)
      const existing = existingBySlug.get(slug)
      if (existing) {
        ids.set(category.id, existing.id)
        report.categoriesReused += 1
      } else {
        const id = dryRun ? `dry-category-${category.id}` : randomUUID()
        ids.set(category.id, id)
        report.categoriesCreated += 1
        if (!dryRun) {
          await client.query(
            `
            INSERT INTO categories
              (id, workspace_id, name, slug, description, parent_id, display_order, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NULL, $6, NOW(), NOW())
          `,
            [
              id,
              workspaceId,
              category.name.slice(0, 120),
              slug,
              category.description.slice(0, 500),
              category.displayOrder,
            ]
          )
        }
      }
    }

    for (const category of sourceCategories) {
      const slug = safeSlug(category.slug, category.name)
      const existing = existingBySlug.get(slug)
      const parentId = category.parentId ? ids.get(category.parentId) : null
      const changed =
        existing &&
        (existing.name !== category.name.slice(0, 120) ||
          existing.description !== category.description.slice(0, 500) ||
          existing.parent_id !== parentId ||
          Number(existing.display_order) !== category.displayOrder)
      if (changed) report.categoriesUpdated += 1
      if (!dryRun && (changed || !existing)) {
        await client.query(
          `
          UPDATE categories SET name = $1, description = $2, parent_id = $3,
            display_order = $4, updated_at = NOW()
          WHERE id = $5 AND workspace_id = $6
        `,
          [
            category.name.slice(0, 120),
            category.description.slice(0, 500),
            parentId,
            category.displayOrder,
            ids.get(category.id),
            workspaceId,
          ]
        )
      }
    }
    if (!dryRun) await client.query("COMMIT")
  } catch (error) {
    if (!dryRun) await client.query("ROLLBACK")
    throw error
  }
  return ids
}

async function importListing({
  target,
  workspaceId,
  sourceId,
  translated,
  categoryLinks,
  dryRun,
}) {
  categoryLinks = normalizedCategoryLinks(categoryLinks)
  const existingResult = await target.query(
    `
    SELECT id, title, slug, meta_description, rating, status, display_order, featured_image,
           contact_links, body
    FROM directory_listings
    WHERE workspace_id = $1 AND source_type = $2 AND source_id = $3
    LIMIT 1
  `,
    [workspaceId, SOURCE_TYPE, sourceId]
  )
  const existing = existingResult.rows[0]
  const slug = await availableListingSlug(
    target,
    workspaceId,
    translated.slug,
    existing?.id ?? null
  )
  const values = { ...translated, slug }
  const id = existing?.id ?? (dryRun ? `dry-listing-${sourceId}` : randomUUID())
  const categoryChanged = existing
    ? await listingCategoriesDiffer(target, workspaceId, id, categoryLinks)
    : categoryLinks.length > 0
  const changed =
    !existing || categoryChanged || !sameListing(existing, values, dryRun)

  if (!dryRun && (!existing || changed)) {
    await target.query("BEGIN")
    try {
      if (!existing) {
        await target.query(
          `
          INSERT INTO directory_listings
            (id, workspace_id, title, slug, meta_description, rating, status,
             display_order, featured_image, contact_links, body, source_type,
             source_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, NOW(), NOW())
        `,
          [
            id,
            workspaceId,
            values.title,
            slug,
            values.metaDescription,
            values.rating,
            values.status,
            values.displayOrder,
            values.featuredImage,
            JSON.stringify(values.contactLinks),
            JSON.stringify(values.body),
            SOURCE_TYPE,
            sourceId,
          ]
        )
      } else if (changed) {
        await target.query(
          `
          UPDATE directory_listings SET title = $1, slug = $2, meta_description = $3,
            rating = $4, status = $5, display_order = $6, featured_image = $7,
            contact_links = $8::jsonb, body = $9::jsonb, updated_at = NOW()
          WHERE id = $10 AND workspace_id = $11
        `,
          [
            values.title,
            slug,
            values.metaDescription,
            values.rating,
            values.status,
            values.displayOrder,
            values.featuredImage,
            JSON.stringify(values.contactLinks),
            JSON.stringify(values.body),
            id,
            workspaceId,
          ]
        )
      }
      if (!existing || categoryChanged) {
        await replaceListingCategories(target, workspaceId, id, categoryLinks)
      }
      await target.query("COMMIT")
    } catch (error) {
      await target.query("ROLLBACK")
      throw error
    }
  }
  return {
    id,
    action: existing ? (changed ? "updated" : "skipped") : "created",
  }
}

function normalizedCategoryLinks(links) {
  const unique = new Map()
  for (const link of links) {
    const current = unique.get(link.categoryId)
    unique.set(link.categoryId, {
      categoryId: link.categoryId,
      isPrimary: Boolean(current?.isPrimary || link.isPrimary),
    })
  }
  let primaryUsed = false
  return [...unique.values()].map((link) => {
    const isPrimary = link.isPrimary && !primaryUsed
    primaryUsed ||= isPrimary
    return { ...link, isPrimary }
  })
}

async function availableListingSlug(client, workspaceId, wanted, existingId) {
  const base = safeSlug(wanted, "listing")
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    const ending = suffix === 1 ? "" : `-${suffix}`
    const candidate = `${base.slice(0, 160 - ending.length)}${ending}`
    const result = await client.query(
      "SELECT id FROM directory_listings WHERE workspace_id = $1 AND slug = $2 AND ($3::text IS NULL OR id <> $3) LIMIT 1",
      [workspaceId, candidate, existingId]
    )
    if (!result.rowCount) return candidate
  }
  throw new Error(`Could not find a free listing address for ${wanted}.`)
}

function sameListing(row, listing, ignoreFeaturedImage = false) {
  return (
    row.title === listing.title &&
    row.slug === listing.slug &&
    row.meta_description === listing.metaDescription &&
    (row.rating === null ? null : Number(row.rating)) === listing.rating &&
    row.status === listing.status &&
    Number(row.display_order) === listing.displayOrder &&
    (ignoreFeaturedImage || row.featured_image === listing.featuredImage) &&
    JSON.stringify(stableJson(row.contact_links)) ===
      JSON.stringify(stableJson(listing.contactLinks)) &&
    JSON.stringify(stableJson(row.body)) ===
      JSON.stringify(stableJson(listing.body))
  )
}

async function listingCategoriesDiffer(client, workspaceId, listingId, links) {
  const result = await client.query(
    `
    SELECT category_id, is_primary FROM category_relationships
    WHERE workspace_id = $1 AND content_type = 'directory_listing' AND content_id = $2
    ORDER BY category_id
  `,
    [workspaceId, listingId]
  )
  const current = result.rows
    .map((row) => `${row.category_id}:${row.is_primary}`)
    .sort()
  const wanted = links
    .map((link) => `${link.categoryId}:${link.isPrimary}`)
    .sort()
  return JSON.stringify(current) !== JSON.stringify(wanted)
}

async function replaceListingCategories(client, workspaceId, listingId, links) {
  await client.query(
    "DELETE FROM category_relationships WHERE workspace_id = $1 AND content_type = 'directory_listing' AND content_id = $2",
    [workspaceId, listingId]
  )
  for (const link of links) {
    await client.query(
      `
      INSERT INTO category_relationships
        (id, workspace_id, category_id, content_type, content_id, is_primary, created_at)
      VALUES ($1, $2, $3, 'directory_listing', $4, $5, NOW())
    `,
      [randomUUID(), workspaceId, link.categoryId, listingId, link.isPrimary]
    )
  }
}

async function importPhoto({ target, workspace, sourceUrl, title, cache }) {
  if (cache.has(sourceUrl)) {
    const cached = await cache.get(sourceUrl)
    return { ...cached, stored: false }
  }
  const promise = importPhotoOnce({
    target,
    workspace,
    sourceUrl,
    title,
  }).catch((error) => {
    throw new Error(
      `Photo import failed for ${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`
    )
  })
  cache.set(sourceUrl, promise)
  return promise
}

async function importPhotoOnce({ target, workspace, sourceUrl, title }) {
  const hash = createHash("sha256").update(sourceUrl).digest("hex")
  const existing = await target.query(
    "SELECT storage_path FROM media WHERE workspace_id = $1 AND storage_path LIKE $2 LIMIT 1",
    [workspace.id, `${workspace.id}/imports/eatdrinktoronto/${hash}.%`]
  )
  if (existing.rowCount)
    return {
      url: publicMediaUrl(existing.rows[0].storage_path),
      stored: false,
    }

  const image = await downloadImage(new URL(sourceUrl), 0)
  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  }[image.mimeType]
  const storagePath = `${workspace.id}/imports/eatdrinktoronto/${hash}.${extension}`
  const client = r2Client()
  await client.send(
    new PutObjectCommand({
      Bucket: requiredEnv("CUSTOM_SHELL_R2_BUCKET_NAME"),
      Key: storagePath,
      Body: image.data,
      ContentType: image.mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  )

  try {
    await target.query(
      `
      INSERT INTO media
        (id, workspace_id, user_id, filename, original_name, alt_text, file_size,
         mime_type, file_type, storage_path, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'image', $9, NOW(), NOW())
    `,
      [
        randomUUID(),
        workspace.id,
        workspace.userId,
        `${hash}.${extension}`,
        `${safeFilename(title)}.${extension}`,
        title.slice(0, 500),
        image.data.byteLength,
        image.mimeType,
        storagePath,
      ]
    )
  } catch (error) {
    await client
      .send(
        new DeleteObjectCommand({
          Bucket: requiredEnv("CUSTOM_SHELL_R2_BUCKET_NAME"),
          Key: storagePath,
        })
      )
      .catch(() => undefined)
    throw error
  }
  return { url: publicMediaUrl(storagePath), stored: true }
}

async function downloadImage(url, redirects) {
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("The image address is not a public HTTP address.")
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (
    !addresses.length ||
    addresses.some((item) => isPrivateAddress(item.address))
  ) {
    throw new Error("The image address resolves to a private network.")
  }
  const pinned = addresses[0]
  const response = await requestPinned(url, pinned.address, pinned.family)
  if (response.status >= 300 && response.status < 400 && response.location) {
    if (redirects >= MAX_REDIRECTS)
      throw new Error("The image redirected too many times.")
    return downloadImage(new URL(response.location, url), redirects + 1)
  }
  if (response.status !== 200)
    throw new Error(`The image returned HTTP ${response.status}.`)
  if (!IMAGE_MIMES.has(response.mimeType))
    throw new Error("The response is not a supported image.")
  validateImageSignature(response.mimeType, response.data)
  return { mimeType: response.mimeType, data: response.data }
}

function requestPinned(url, address, family) {
  const transport = url.protocol === "https:" ? https : http
  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [{ address, family }])
            return
          }
          callback(null, address, family)
        },
        headers: {
          Host: url.host,
          Accept: "image/jpeg,image/png,image/gif,image/webp",
        },
        timeout: IMAGE_TIMEOUT_MS,
      },
      (response) => {
        const length = Number(response.headers["content-length"] ?? 0)
        if (length > MAX_IMAGE_BYTES) {
          response.destroy()
          reject(new Error("The image is larger than 10 MB."))
          return
        }
        const chunks = []
        let size = 0
        response.on("data", (chunk) => {
          size += chunk.length
          if (size > MAX_IMAGE_BYTES) {
            response.destroy(new Error("The image is larger than 10 MB."))
            return
          }
          chunks.push(chunk)
        })
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            location: response.headers.location,
            mimeType: String(response.headers["content-type"] ?? "")
              .split(";")[0]
              .toLowerCase(),
            data: Buffer.concat(chunks),
          })
        )
        response.on("error", reject)
      }
    )
    request.on("timeout", () =>
      request.destroy(new Error("The image request timed out."))
    )
    request.on("error", reject)
    request.end()
  })
}

function validateImageSignature(mimeType, data) {
  const matches =
    (mimeType === "image/jpeg" &&
      data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
    (mimeType === "image/png" &&
      data
        .subarray(0, 8)
        .equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        )) ||
    (mimeType === "image/gif" &&
      ["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("ascii"))) ||
    (mimeType === "image/webp" &&
      data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WEBP")
  if (!matches)
    throw new Error("The file contents do not match its image type.")
}

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${requiredEnv("CUSTOM_SHELL_R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("CUSTOM_SHELL_R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("CUSTOM_SHELL_R2_SECRET_ACCESS_KEY"),
    },
  })
}

function publicMediaUrl(storagePath) {
  return `${requiredEnv("CUSTOM_SHELL_R2_PUBLIC_URL").replace(/\/+$/, "")}/${storagePath}`
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

function safeFilename(value) {
  return (
    value
      .replace(/[^a-zA-Z0-9.-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 180) || "listing"
  )
}

function addDroppedKind(report, type) {
  report.droppedByKind[type] = (report.droppedByKind[type] ?? 0) + 1
}

async function writeReports(output, report, dropped) {
  await mkdir(output, { recursive: true })
  await Promise.all([
    writeFile(
      path.join(output, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`
    ),
    writeFile(
      path.join(output, "dropped.json"),
      `${JSON.stringify(dropped, null, 2)}\n`
    ),
  ])
}

function printReport(report, output) {
  console.log(JSON.stringify(report, null, 2))
  console.log(`Report written to ${path.join(output, "report.json")}`)
  console.log(`Dropped data written to ${path.join(output, "dropped.json")}`)
}

function loadEnv(filename) {
  try {
    process.loadEnvFile(filename)
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }
}
