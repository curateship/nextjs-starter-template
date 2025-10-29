# Migrate Media Storage from Supabase to Cloudflare R2

**Date:** 2025-10-20
**Status:** Ready to Implement
**Estimated Time:** 1-2 hours
**Complexity:** Low

## Problem

Hitting Supabase's 5GB/month bandwidth limit quickly due to video file egress. Need unlimited bandwidth without high costs.

## Solution

Move all media files (videos, images) to **Cloudflare R2** which offers:
- **Zero egress fees** (unlimited bandwidth)
- **10GB storage free**
- S3-compatible API
- Global CDN included
- Fast performance

## Cost Comparison

### Current (Supabase)
- Free tier: 5GB bandwidth/month
- After limit: Must upgrade to Pro ($25/month) for 50GB bandwidth

### With Cloudflare R2
- Free tier: 10GB storage + unlimited bandwidth
- After 10GB: $0.015/GB storage/month
- **Bandwidth: Always $0**

**Example:** 20GB videos with 100GB bandwidth/month
- Supabase Pro: $25/month minimum
- R2: $0.15/month (just storage, no bandwidth charges!)

---

## Phase 1: Setup Cloudflare R2

### 1.1 Create Cloudflare Account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up (free account)
3. Verify email

### 1.2 Enable R2

1. Log into Cloudflare Dashboard
2. Go to **R2** in the sidebar
3. Click **"Purchase R2"** (it's free, but needs to be enabled)
4. Verify payment method (won't be charged unless you exceed free tier)

### 1.3 Create R2 Bucket

1. In R2 dashboard, click **"Create bucket"**
2. Bucket name: `site-media` (or whatever you prefer)
3. Location: **Automatic** (Cloudflare picks best location)
4. Click **"Create bucket"**

### 1.4 Generate API Tokens

1. In R2 dashboard, click **"Manage R2 API Tokens"**
2. Click **"Create API Token"**
3. Token name: `nextjs-media-access`
4. Permissions: **"Object Read & Write"**
5. Select bucket: `site-media`
6. Click **"Create API Token"**
7. **Save these values** (you'll need them):
   - Access Key ID
   - Secret Access Key
   - Jurisdiction-specific endpoint (e.g., `https://xxxxx.r2.cloudflarestorage.com`)

### 1.5 Set Up Public Access (Optional)

If you want direct public URLs without authentication:

1. Go to your bucket settings
2. Click **"Settings"** tab
3. Under **"Public access"**, click **"Allow Access"**
4. Copy your public bucket URL (e.g., `https://pub-xxxxx.r2.dev`)

**Note:** For better control, you can use custom domains later.

---

## Phase 2: Update Application Code

### 2.1 Install AWS SDK (R2 is S3-compatible)

```bash
npm install @aws-sdk/client-s3
npm install @aws-sdk/s3-request-presigner
```

### 2.2 Create R2 Client Utility

**New File:** `src/lib/utils/r2.ts`

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// R2 credentials from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'site-media'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL // Optional: if using public access

// Create S3 client configured for R2
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  fileName: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
  })

  await r2Client.send(command)

  // Return public URL
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${fileName}`
  }

  // Or return URL through your proxy
  return `/api/media/proxy?url=${encodeURIComponent(`r2://${fileName}`)}`
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(fileName: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
  })

  await r2Client.send(command)
}

/**
 * Get a presigned URL for private file access (expires in 1 hour)
 */
export async function getPresignedUrl(fileName: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
  })

  const url = await getSignedUrl(r2Client, command, { expiresIn })
  return url
}

/**
 * Get public URL for a file
 */
export function getPublicUrl(fileName: string): string {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${fileName}`
  }

  // Fallback to proxy
  return `/api/media/proxy?url=${encodeURIComponent(`r2://${fileName}`)}`
}

/**
 * Get object from R2 (for proxying)
 */
export async function getFromR2(fileName: string) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
  })

  const response = await r2Client.send(command)
  return response
}
```

### 2.3 Update Environment Variables

**Add to `.env`:**

```bash
# Cloudflare R2 Configuration
R2_ACCOUNT_ID="your-account-id"
R2_ACCESS_KEY_ID="your-access-key-id"
R2_SECRET_ACCESS_KEY="your-secret-access-key"
R2_BUCKET_NAME="site-media"
R2_PUBLIC_URL="https://pub-xxxxx.r2.dev"  # Optional: if using public access
```

**Update `.env.example`:**

```bash
# Cloudflare R2 Configuration (for media storage)
R2_ACCOUNT_ID="your-r2-account-id"              # From Cloudflare R2 dashboard
R2_ACCESS_KEY_ID="your-r2-access-key"           # From R2 API token
R2_SECRET_ACCESS_KEY="your-r2-secret-key"       # From R2 API token
R2_BUCKET_NAME="site-media"                     # Your R2 bucket name
R2_PUBLIC_URL="https://pub-xxxxx.r2.dev"        # Optional: Public bucket URL
```

### 2.4 Update Media Upload Route

**Update:** `src/app/api/media/upload/route.ts`

Replace Supabase storage with R2:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/utils/r2'
import { createClient } from '@/lib/supabase/client'

export async function POST(request: NextRequest) {
  try {
    // Check authentication (still using Supabase Auth for now)
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get file from form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type (optional)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }

    // Validate file size (optional, e.g., max 100MB)
    const maxSize = 100 * 1024 * 1024 // 100MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${timestamp}_${sanitizedName}`

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to R2
    const url = await uploadToR2(fileName, buffer, file.type)

    return NextResponse.json({
      url,
      fileName,
      size: file.size,
      type: file.type
    }, { status: 200 })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
```

### 2.5 Update Media Proxy Route (Optional)

If using public URLs, you might not need the proxy. But if you want to keep it for R2 private files:

**Update:** `src/app/api/media/proxy/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getFromR2 } from '@/lib/utils/r2'

const FETCH_TIMEOUT = 10000

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const range = request.headers.get('range')

    let response: Response

    // Check if it's an R2 URL
    if (url.startsWith('r2://')) {
      // Extract filename from r2:// URL
      const fileName = url.replace('r2://', '')

      // Get from R2
      const r2Object = await getFromR2(fileName)

      if (!r2Object.Body) {
        throw new Error('No body in R2 response')
      }

      // Convert stream to response
      const body = await streamToBuffer(r2Object.Body as any)

      clearTimeout(timeoutId)

      const contentType = r2Object.ContentType || 'application/octet-stream'
      const contentLength = r2Object.ContentLength?.toString() || body.length.toString()

      // Handle range requests for video streaming
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : body.length - 1
        const chunksize = (end - start) + 1
        const chunk = body.slice(start, end + 1)

        return new NextResponse(chunk, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${body.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }

      return new NextResponse(body, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': contentLength,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    // Fallback: proxy external URLs (Supabase, etc.)
    const fetchOptions: RequestInit = {
      signal: controller.signal,
      headers: range ? { Range: range } : {},
    }

    response = await fetch(url, fetchOptions)
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const contentLength = response.headers.get('content-length')
    const contentRange = response.headers.get('content-range')

    if (range && contentRange) {
      return new NextResponse(response.body, {
        status: 206,
        headers: {
          'Content-Range': contentRange,
          'Accept-Ranges': 'bytes',
          'Content-Length': contentLength || '',
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': contentLength || '',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
      },
    })

  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Media proxy timeout after ${FETCH_TIMEOUT}ms for URL:`, url)
      return NextResponse.json(
        { error: 'Request timeout - media server took too long to respond' },
        { status: 504 }
      )
    }

    console.error('Media proxy error:', error)
    return NextResponse.json({
      error: 'Failed to proxy media',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Helper to convert stream to buffer
async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  return Buffer.concat(chunks)
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Range, Content-Length',
    },
  })
}
```

---

## Phase 3: Migrate Existing Media Files

### 3.1 Create Migration Script

**New File:** `scripts/migrate-supabase-to-r2.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { uploadToR2 } from '../src/lib/utils/r2'

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
```

### 3.2 Add Migration Script to package.json

```json
{
  "scripts": {
    "migrate:media": "tsx scripts/migrate-supabase-to-r2.ts"
  }
}
```

### 3.3 Install tsx (if not already installed)

```bash
npm install --save-dev tsx
```

### 3.4 Run Migration

```bash
npm run migrate:media
```

**Important:** This will copy files to R2 but NOT delete from Supabase. Keep Supabase files until you verify everything works!

---

## Phase 4: Update Database URLs (If Applicable)

If you store media URLs in your database, you need to update them.

### 4.1 Check Where URLs are Stored

Common places:
- `products.featured_image_url`
- `posts.featured_image_url`
- Any content blocks with media URLs

### 4.2 Update URLs in Database

**Option A: If using public R2 URLs:**

```sql
-- Update products
UPDATE products
SET featured_image_url = REPLACE(
  featured_image_url,
  'https://dqlgeutcmshgcwbactmu.supabase.co/storage/v1/object/public/site-media/',
  'https://pub-xxxxx.r2.dev/'
)
WHERE featured_image_url LIKE '%supabase.co%';

-- Update posts
UPDATE posts
SET featured_image_url = REPLACE(
  featured_image_url,
  'https://dqlgeutcmshgcwbactmu.supabase.co/storage/v1/object/public/site-media/',
  'https://pub-xxxxx.r2.dev/'
)
WHERE featured_image_url LIKE '%supabase.co%';

-- Update any JSON content blocks (if applicable)
-- This is more complex and depends on your schema
```

**Option B: If using proxy URLs:**

```sql
-- Update to use proxy
UPDATE products
SET featured_image_url = CONCAT(
  '/api/media/proxy?url=r2://',
  SUBSTRING(featured_image_url FROM '[^/]*$')
)
WHERE featured_image_url LIKE '%supabase.co%';
```

---

## Phase 5: Testing

### 5.1 Test Checklist

- [ ] New file uploads go to R2
- [ ] Uploaded files are accessible
- [ ] Videos stream correctly (with range requests)
- [ ] Images load on all pages
- [ ] Proxy works for both R2 and legacy Supabase URLs
- [ ] Cache headers are set correctly
- [ ] No console errors
- [ ] Mobile devices can access media

### 5.2 Test Upload

```bash
# Test via API route or use your UI
curl -X POST http://localhost:3000/api/media/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-image.jpg"
```

### 5.3 Verify in R2 Dashboard

1. Go to Cloudflare R2 dashboard
2. Click on your bucket
3. Verify files are there
4. Check file permissions

### 5.4 Monitor Bandwidth

For first few days, monitor:
- Cloudflare R2 dashboard → Usage
- Check requests and bandwidth
- Verify you're within free tier

---

## Phase 6: Cleanup (After 1 Week)

Once everything is working perfectly:

### 6.1 Delete Old Supabase Files

**Only do this after confirming everything works!**

```typescript
// Script to delete old files
const { data: files } = await supabase
  .storage
  .from('site-media')
  .list()

for (const file of files) {
  await supabase
    .storage
    .from('site-media')
    .remove([file.name])
}
```

### 6.2 Remove Supabase Storage Code

- Keep Supabase Auth and Database
- Remove Supabase Storage imports
- Clean up old upload code

---

## Advanced: Custom Domain (Optional)

For better branding and caching, use a custom domain for R2.

### Setup Custom Domain

1. In R2 bucket settings, click **"Connect Domain"**
2. Enter your subdomain (e.g., `cdn.yourdomain.com`)
3. Add CNAME record in your DNS:
   ```
   cdn.yourdomain.com → pub-xxxxx.r2.dev
   ```
4. Wait for DNS propagation (5-15 minutes)
5. Update `R2_PUBLIC_URL` in `.env`:
   ```
   R2_PUBLIC_URL="https://cdn.yourdomain.com"
   ```

**Benefits:**
- Cleaner URLs
- Better cache control
- SSL via Cloudflare

---

## Troubleshooting

### Issue: "Access Denied" errors

**Solution:**
- Check R2 API token permissions
- Verify bucket name is correct
- Ensure token has "Object Read & Write" permission

### Issue: Videos don't stream/play

**Solution:**
- Check range request headers are being passed
- Verify `Accept-Ranges: bytes` header is set
- Test with different browsers

### Issue: CORS errors

**Solution:**
Add CORS policy to R2 bucket:

1. In R2 bucket settings
2. Go to **"CORS policy"**
3. Add:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["Content-Length", "Content-Range"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### Issue: High R2 costs

**Check:**
- Storage usage (Class A/B operations)
- Make sure you're using public URLs, not presigned URLs for public content
- Implement proper caching to reduce requests

---

## Monitoring & Maintenance

### What to Monitor

1. **R2 Dashboard:**
   - Storage usage (should stay under 10GB free tier)
   - Number of requests
   - Bandwidth (should be $0 regardless of usage!)

2. **Application Performance:**
   - Media load times
   - Failed upload rate
   - Browser console errors

3. **Costs:**
   - Check Cloudflare billing monthly
   - Should be $0 unless you exceed 10GB storage

### Backup Strategy

R2 doesn't have automatic backups. Consider:
- Keep important files in git (for small files)
- Periodic backups to local storage or another cloud
- Version control for critical media

---

## Next Steps

1. ✅ Created R2 bucket and API tokens
2. ✅ Updated code to use R2
3. ✅ Migrated existing files
4. ✅ Tested thoroughly
5. ✅ Updated database URLs
6. ✅ Monitored for 1 week
7. ⏳ Clean up Supabase storage
8. ⏳ (Optional) Set up custom domain

## Summary

**Before:**
- Supabase Storage: 5GB bandwidth/month limit
- Risk of hitting limit and breaking app
- Would need to upgrade to $25/month

**After:**
- Cloudflare R2: Unlimited bandwidth
- 10GB storage free
- $0 egress fees
- Faster global CDN

**Migration time:** 1-2 hours
**Savings:** ~$300+/year (avoid Supabase Pro upgrade)
