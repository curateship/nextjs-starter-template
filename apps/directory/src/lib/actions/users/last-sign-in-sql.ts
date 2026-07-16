import { sql } from 'drizzle-orm'

import { authUsers } from '@/lib/db/schema'

export function lastSignInAtDateSql() {
  return sql<Date | null>`(
    select max("updatedAt")
    from user_sessions
    where "userId" = ${authUsers.id}
  )`
}

export function lastSignInAtSql() {
  return sql<string | null>`${lastSignInAtDateSql()}::text`
}
