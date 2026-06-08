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
  await pool.query(
    `
      insert into directory_templates (site_id, name, content_blocks, is_default)
      select $1::uuid, 'Blank', '{}'::jsonb, not exists (
        select 1 from directory_templates where site_id = $1::uuid and is_default = true
      )
      where not exists (
        select 1 from directory_templates where site_id = $1::uuid and name = 'Blank'
      )
    `,
    [siteId]
  )

  const [{ id: templateId }] = (await pool.query<{ id: string }>(
    `
      select id
      from directory_templates
      where site_id = $1
      order by is_default desc, (name = 'Blank') desc, updated_at desc
      limit 1
    `,
    [siteId]
  )).rows

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
          template_id,
          title,
          slug,
          meta_description,
          status,
          display_order,
          content_blocks
        )
        select
          $1::uuid,
          $4::uuid,
          'Scale Directory ' || series,
          'scale-directory-' || series,
          'Seeded directory record ' || series,
          'published',
          series,
          '{}'::jsonb
        from generate_series($2::int, $3::int) as series
      `,
      [siteId, startIndex, endIndex, templateId]
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
