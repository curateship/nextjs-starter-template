import { createFileRoute } from "@tanstack/react-router"
import { sql } from "drizzle-orm"

import { db } from "@/server/db"

/**
 * Is this web container fit to take traffic?
 *
 * Two things have to be true, and they are checked rather than assumed: the
 * server is up far enough to answer a request, and its database answers a
 * query. The second one matters because a server whose database is unreachable
 * returns a confident 200 on its home page and then throws on every screen
 * that loads anything — which looks healthy to a load balancer and broken to
 * everyone else.
 *
 * Coolify points its health check here, so a replacement container that cannot
 * reach the database never takes over from the one that can.
 *
 * **It says almost nothing on purpose.** No version, no host, no database
 * name, no driver error. This is an unauthenticated address on the open
 * internet and its whole job is one bit of information; anything else it
 * volunteered would be free reconnaissance. The real error goes to the
 * container's own log, where the person deploying can read it.
 */

/**
 * Never store this answer anywhere.
 *
 * The whole value of a health check is that it is true *now*. A proxy or CDN
 * holding on to a 200 for even thirty seconds means a broken app that looks
 * fine, which is worse than having no check at all. Docker asks the container
 * directly and sees no proxy, but nothing stops an uptime monitor being pointed
 * at the public address, and that is exactly when it matters.
 */
const NEVER_CACHE = { "Cache-Control": "no-store" }

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await db.execute(sql`select 1`)
        } catch (error) {
          console.error("Health check failed: the database did not answer", error)
          return Response.json(
            { status: "unavailable" },
            { status: 503, headers: NEVER_CACHE }
          )
        }

        return Response.json({ status: "ok" }, { headers: NEVER_CACHE })
      },
    },
  },
})
