import { z } from "zod"

/**
 * The team a request is about, sent by the page: a `/teams/<id>` address or a
 * project's own team. Only the site admin's requests read it, through `inTeam`
 * (`src/server/project/access.ts`); an employee's team is their own.
 */
export const teamScope = { teamId: z.string().min(1).max(36).optional() }
