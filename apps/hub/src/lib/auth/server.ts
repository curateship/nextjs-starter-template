import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { Pool } from 'pg'
import * as bcrypt from 'bcryptjs'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
})

type SessionCacheVersionInput = {
  token?: string | null
}

type SessionCacheVersionUser = {
  id?: string | null
}

export async function getSessionCookieCacheVersion(
  session: SessionCacheVersionInput,
  user: SessionCacheVersionUser
) {
  if (!session.token || !user.id) {
    return 'missing'
  }

  const result = await pool.query<{
    sessionUpdatedAt: string
    userUpdatedAt: string
    role: string | null
    banned: boolean | null
    banExpires: string | null
    name: string | null
    email: string | null
    displayName: string | null
  }>(
    `
      select
        s."updatedAt"::text as "sessionUpdatedAt",
        u."updatedAt"::text as "userUpdatedAt",
        u.role,
        u.banned,
        u."banExpires"::text as "banExpires",
        u.name,
        u.email,
        u."displayName"
      from user_sessions s
      join users u on u.id = s."userId"
      where s.token = $1
        and u.id = $2
      limit 1
    `,
    [session.token, user.id]
  )

  const row = result.rows[0]

  if (!row) {
    return 'revoked'
  }

  return JSON.stringify([
    row.sessionUpdatedAt,
    row.userUpdatedAt,
    row.role ?? '',
    row.banned ? '1' : '0',
    row.banExpires ?? '',
    row.name ?? '',
    row.email ?? '',
    row.displayName ?? '',
  ])
}

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    password: {
      hash: async (password) => {
        return await bcrypt.hash(password, 10)
      },
      verify: async ({ hash, password }) => {
        return await bcrypt.compare(password, hash)
      },
    },
  },
  account: {
    modelName: 'user_auth_paths',
  },
  verification: {
    modelName: 'user_verifications',
  },
  session: {
    modelName: 'user_sessions',
    cookieCache: {
      enabled: true,
      maxAge: 7 * 24 * 60 * 60, // 7 days
      version: getSessionCookieCacheVersion,
    },
  },
  user: {
    modelName: 'users',
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'end_user',
        input: false,
      },
      displayName: {
        type: 'string',
        required: false,
        input: true,
        fieldName: 'displayName',
      },
    },
  },
  plugins: [admin()],
})

export type Session = typeof auth.$Infer.Session
