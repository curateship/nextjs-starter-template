// One-off backfill: re-encode images already sitting in R2.
//
// New uploads are shrunk in the browser (src/lib/utils/image-resize.ts), but
// everything uploaded before that went in at full size — the live homepage was
// serving 330 KB PNGs for tiles rendering at a third of the viewport.
//
// Why it writes back to the SAME key: image URLs are not only in the `media`
// table, they are baked into the stored content JSON of every page, listing,
// post, product and category. Writing to a new key would mean rewriting URLs
// across all of that, which is a far riskier migration than re-encoding bytes.
// Keeping the key means every existing URL keeps working untouched.
//
// The original bytes are copied to `_originals/<key>` first, so this is
// reversible: re-upload from there to undo.
//
// Note: a re-encoded file keeps its original extension (a .png key now holds
// WebP bytes). Browsers honour the Content-Type header, not the extension, so
// this is cosmetic. Renaming would reintroduce the URL-rewriting problem above.
//
// Run with:
//   node --env-file=.env.local scripts/optimize-existing-images.mjs --dry-run
//   node --env-file=.env.local scripts/optimize-existing-images.mjs --commit
//
// sharp is deliberately NOT a dependency of this app. The Dockerfile's builder
// stage installs devDependencies, so declaring it would force a native musl
// build inside Alpine on every deploy — real risk for a script that runs by
// hand, rarely. Install it ad hoc if it is not already present:
//
//   pnpm add -D sharp    (then revert package.json and the lockfile)

import { Buffer } from "node:buffer"
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import pg from "pg"
import sharp from "sharp"

// Kept in step with src/lib/utils/image-resize.ts so a backfilled image and a
// freshly uploaded one come out the same. (That file is TypeScript and browser
// only, so the values cannot simply be imported here.)
const MAX_DIMENSION = 1600
const WEBP_QUALITY = 82
const ORIGINALS_PREFIX = "_originals/"

const commit = process.argv.includes("--commit")
const dryRun = !commit

function numericFlag(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split("=")[1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** Rows are ordered biggest-first, so a limit samples where the wins are. */
const limit = numericFlag("limit", Infinity)

/** 3,000+ images one at a time is an hour of waiting; the work is IO-bound. */
const concurrency = numericFlag("concurrency", 6)

const {
  DATABASE_URL,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME = "site-media",
} = process.env

for (const [name, value] of Object.entries({
  DATABASE_URL,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
})) {
  if (!value) {
    console.error(`Missing ${name}. Pass --env-file=.env.local (or the production env).`)
    process.exit(1)
  }
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

async function getObject(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
  return {
    body: Buffer.from(await res.Body.transformToByteArray()),
    contentType: res.ContentType,
  }
}

function putObject(key, body, contentType) {
  return s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  )
}

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`
}

const client = new pg.Client({ connectionString: DATABASE_URL })
await client.connect()

const { rows: allRows } = await client.query(`
  select id, storage_path, mime_type, file_size, original_name
  from media
  where file_type = 'image'
    and mime_type in ('image/jpeg','image/jpg','image/png','image/webp')
  order by file_size desc
`)

const rows = Number.isFinite(limit) ? allRows.slice(0, limit) : allRows

console.log(
  `${dryRun ? "DRY RUN" : "COMMITTING"} — ${rows.length} of ${allRows.length} candidate images` +
    (Number.isFinite(limit) ? ` (largest ${limit})` : "") +
    `, concurrency ${concurrency}\n`
)

let processed = 0
let skipped = 0
let failed = 0
let bytesBefore = 0
let bytesAfter = 0

async function processRow(row) {
  const key = row.storage_path
  try {
    const { body } = await getObject(key)
    const image = sharp(body, { failOn: "none" })
    const meta = await image.metadata()

    const longest = Math.max(meta.width || 0, meta.height || 0)
    if (!longest) {
      console.log(`skip   ${key} — unreadable dimensions`)
      skipped += 1
      return
    }

    const pipeline = longest > MAX_DIMENSION
      ? image.resize({
          width: meta.width >= meta.height ? MAX_DIMENSION : undefined,
          height: meta.height > meta.width ? MAX_DIMENSION : undefined,
          withoutEnlargement: true,
        })
      : image

    const optimized = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()

    // Re-encoding that saves nothing is not worth the churn.
    if (optimized.length >= body.length) {
      console.log(`skip   ${key} — already smaller (${formatKB(body.length)})`)
      skipped += 1
      return
    }

    bytesBefore += body.length
    bytesAfter += optimized.length
    processed += 1

    const saved = (1 - optimized.length / body.length) * 100
    console.log(
      `${dryRun ? "would " : ""}write ${key} — ${formatKB(body.length)} -> ${formatKB(optimized.length)} (-${saved.toFixed(0)}%)`
    )

    if (dryRun) return

    // Back up the original before replacing it.
    await putObject(ORIGINALS_PREFIX + key, body, row.mime_type)
    await putObject(key, optimized, "image/webp")
    await client.query(
      `update media set mime_type = $1, file_size = $2, updated_at = now() where id = $3`,
      ["image/webp", optimized.length, row.id]
    )
  } catch (error) {
    failed += 1
    console.error(`FAIL   ${key} — ${error.message}`)
  }
}

// Bounded worker pool: the work is dominated by R2 round trips, so a handful of
// workers pulling from one shared queue keeps thousands of images tractable
// without opening thousands of sockets.
let cursor = 0
await Promise.all(
  Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor]
      cursor += 1
      await processRow(row)
    }
  })
)

console.log(
  `\n${dryRun ? "Would process" : "Processed"} ${processed}, skipped ${skipped}, failed ${failed}`
)
if (processed) {
  console.log(
    `Total ${formatKB(bytesBefore)} -> ${formatKB(bytesAfter)} ` +
      `(-${((1 - bytesAfter / bytesBefore) * 100).toFixed(0)}%)`
  )
}
if (dryRun) console.log("\nNothing was written. Re-run with --commit to apply.")
else console.log(`\nOriginals backed up under ${ORIGINALS_PREFIX} in the bucket.`)

await client.end()
