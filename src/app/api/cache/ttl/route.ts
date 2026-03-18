import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { writeFile, readFile } from 'fs/promises'
import { join } from 'path'

const ENV_PATH = join(process.cwd(), '.env.local')

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if ((session.user as { role?: string }).role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { ttl } = await request.json()
    const validTtls = ['3600', '21600', '86400', '604800', '31536000']
    if (!validTtls.includes(ttl)) {
      return NextResponse.json({ success: false, error: 'Invalid TTL value' }, { status: 400 })
    }

    // Update CACHE_TTL_SECONDS in .env.local
    let envContent = ''
    try {
      envContent = await readFile(ENV_PATH, 'utf-8')
    } catch {
      // File doesn't exist yet
    }

    if (envContent.includes('CACHE_TTL_SECONDS=')) {
      envContent = envContent.replace(/CACHE_TTL_SECONDS=.*/g, `CACHE_TTL_SECONDS=${ttl}`)
    } else {
      envContent = envContent.trimEnd() + `\nCACHE_TTL_SECONDS=${ttl}\n`
    }

    await writeFile(ENV_PATH, envContent)

    return NextResponse.json({ success: true, ttl })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
