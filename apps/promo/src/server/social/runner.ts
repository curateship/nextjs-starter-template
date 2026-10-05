import { ensureSession, touchSession } from "@/server/browser/session"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { postComment } from "./reddit/post-comment"
import { claimNextJob, failJob, finishJob } from "./jobs"
import { loadFindThread, runKeywordSearch } from "./reddit/search"
import { readAccount } from "./accounts"

/**
 * One turn of the browser work.
 *
 * Kept apart from `worker/src/social-browser.ts` so the loop is a few lines
 * and the work is testable without starting a process.
 *
 * Every job needs the one isolated browser, so the session is opened on the
 * first job and reused by the rest. Opening it costs about a minute; doing
 * that per job would make a run of ten keywords take ten minutes of waiting.
 */

export type TurnResult =
  | { did: "nothing" }
  | { did: "job"; kind: string; jobId: string; ok: boolean; error?: string }

export async function runOneJob(
  claimToken: string,
  db: CustomShellDb = defaultDb
): Promise<TurnResult> {
  const job = await claimNextJob(claimToken, db)
  if (!job) return { did: "nothing" }

  try {
    const account = await readAccount(job.userId, db)
    if (!account) {
      throw new Error("There is no Reddit account set up, so there is nothing to browse with.")
    }

    const session = await ensureSession(job.userId, account.id, db)
    await touchSession(session.id, db)

    if (job.kind === "search") {
      const keywordId = String(job.payload.keywordId ?? "")
      if (!keywordId) throw new Error("That search job names no keyword.")
      await runKeywordSearch(job.userId, keywordId, session.target, db)
    } else if (job.kind === "thread") {
      const findId = String(job.payload.findId ?? "")
      if (!findId) throw new Error("That thread job names no post.")
      await loadFindThread(job.userId, findId, session.target, db)
    } else if (job.kind === "comment") {
      const findId = String(job.payload.findId ?? "")
      const text = String(job.payload.text ?? "")
      if (!findId || !text) throw new Error("That comment job is missing its post or its words.")
      await postComment(
        {
          userId: job.userId,
          findId,
          accountId: String(job.payload.accountId ?? account.id),
          text,
          draftId: job.payload.draftId ? String(job.payload.draftId) : null,
        },
        session.target,
        db
      )
    } else {
      throw new Error(`There is no job kind called "${job.kind}".`)
    }

    await touchSession(session.id, db)
    await finishJob(job.id, claimToken, db)
    return { did: "job", kind: job.kind, jobId: job.id, ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failJob(job.id, claimToken, message, job.attempts, db)
    return { did: "job", kind: job.kind, jobId: job.id, ok: false, error: message }
  }
}
