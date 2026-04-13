import 'dotenv/config'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
const siteIds = (process.env.DIRECTORY_SCALE_SITE_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const rowsPerSite = Number.parseInt(process.env.DIRECTORY_SCALE_ROWS_PER_SITE || '100000', 10)
const batchSize = Number.parseInt(process.env.DIRECTORY_SCALE_BATCH_SIZE || '5000', 10)

if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

if (siteIds.length === 0) {
  throw new Error('DIRECTORY_SCALE_SITE_IDS is required')
}

async function seedSite(pool: Pool, siteId: string) {
  const [{ count }] = (await pool.query<{ count: string }>(
    'select count(*)::int as count from directory where site_id = $1',
    [siteId]
  )).rows

  const existingCount = Number.parseInt(count, 10)
  if (existingCount >= rowsPerSite) {
    console.log(`site ${siteId}: already has ${existingCount} directories, skipping`)
    return
  }

  for (let offset = existingCount; offset < rowsPerSite; offset += batchSize) {
    const batchCount = Math.min(batchSize, rowsPerSite - offset)
    const startIndex = offset + 1
    const endIndex = offset + batchCount

    await pool.query(
      `
        insert into directory (
          site_id,
          title,
          slug,
          meta_description,
          is_published,
          is_private,
          display_order,
          content_blocks,
          description
        )
        select
          $1::uuid,
          'Scale Directory ' || series,
          'scale-directory-' || series,
          'Seeded directory record ' || series,
          true,
          false,
          series,
          jsonb_build_object('_settings', jsonb_build_object('is_private', false)),
          'Seeded description ' || series
        from generate_series($2::int, $3::int) as series
      `,
      [siteId, startIndex, endIndex]
    )

    console.log(`site ${siteId}: seeded ${endIndex}/${rowsPerSite}`)
  }
}

async function main() {
  const pool = new Pool({ connectionString })

  try {
    for (const siteId of siteIds) {
      await seedSite(pool, siteId)
    }
  } finally {
    await pool.end()
  }
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
