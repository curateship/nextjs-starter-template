/**
 * Where this app's data lives — and nothing else, on purpose.
 *
 * This is its own file rather than part of `db.ts` because `db.ts` opens a
 * connection pool the moment it is imported. Anything that only wants to *read*
 * the address would otherwise have to build a pool to get it, and would inherit
 * that pool's failures: the worker's health check did exactly that, and a
 * missing address crashed it at import with a stack trace instead of letting it
 * report "no database is configured" and exit quietly. Importing this file
 * costs nothing and can fail in only one way.
 */

/**
 * The local fallback is a convenience for development and a hazard anywhere
 * else: a deployed container that quietly reached for `localhost` would either
 * find nothing, or — on a machine that happens to run several of these — find
 * *another app's* database and start writing to it. So production says the
 * address out loud or refuses to start. Every app keeps its own database, and
 * this is the line that makes that true rather than merely intended.
 *
 * The argument is only ever passed by the tests, so a check can describe an
 * environment without editing the one it is running in.
 */
export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.CUSTOM_SHELL_DATABASE_URL
  if (configured) return configured

  if (env.NODE_ENV === "production") {
    throw new Error(
      "CUSTOM_SHELL_DATABASE_URL is required in production. Set it to this app's own database; there is no local fallback outside development."
    )
  }

  return `postgresql://postgres:localdev@localhost:${env.CUSTOM_SHELL_POSTGRES_PORT || "54320"}/custom_shell`
}
