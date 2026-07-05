import 'dotenv/config'

import {
  rebuildAllSiteSearchIndexes,
  rebuildSiteSearchIndexForSite,
} from '@/lib/actions/site-search/site-search-index'
import { UUID_REGEX } from '@/lib/utils/validation'

async function main() {
  const siteId = process.argv[2]?.trim()

  if (siteId) {
    if (!UUID_REGEX.test(siteId)) throw new Error('Site ID must be a UUID')
    await rebuildSiteSearchIndexForSite(siteId)
    console.log(`Rebuilt site search index for ${siteId}`)
    return
  }

  await rebuildAllSiteSearchIndexes()
  console.log('Rebuilt site search index for all sites')
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
