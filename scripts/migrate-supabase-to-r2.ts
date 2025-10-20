import { createClient } from '@supabase/supabase-js'
import { uploadToR2 } from '../src/lib/storage/r2'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function migrateMedia() {
  console.log('Starting media migration from Supabase to R2...\n')

  try {
    // List all files in Supabase storage
    const { data: files, error } = await supabase
      .storage
      .from('site-media')
      .list()

    if (error) {
      console.error('Error listing files:', error)
      return
    }

    console.log(`Found ${files.length} files to migrate\n`)

    let successCount = 0
    let failCount = 0

    for (const file of files) {
      try {
        console.log(`Migrating: ${file.name}`)

        // Download from Supabase
        const { data, error: downloadError } = await supabase
          .storage
          .from('site-media')
          .download(file.name)

        if (downloadError) {
          throw downloadError
        }

        // Convert to buffer
        const arrayBuffer = await data.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Get content type
        const contentType = data.type || 'application/octet-stream'

        // Upload to R2
        const url = await uploadToR2(file.name, buffer, contentType)

        console.log(`✓ ${file.name} → ${url}`)
        successCount++

        // Optional: Add delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`✗ ${file.name}:`, error)
        failCount++
      }
    }

    console.log(`\n=== Migration Complete ===`)
    console.log(`Success: ${successCount}`)
    console.log(`Failed: ${failCount}`)
    console.log(`\nNext steps:`)
    console.log(`1. Verify files in R2 dashboard`)
    console.log(`2. Update database URLs (if stored in DB)`)
    console.log(`3. Test that media loads correctly`)
    console.log(`4. Delete old files from Supabase (after confirming everything works)`)

  } catch (error) {
    console.error('Migration error:', error)
  }
}

// Run migration
migrateMedia()
