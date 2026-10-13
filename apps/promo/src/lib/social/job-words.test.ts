import { describe, expect, it } from "vitest"

import { canRetryJob, jobStatusText, programText, type JobStatusInput } from "./job-words"

const now = new Date("2026-10-13T12:00:00Z")

const waiting: JobStatusInput = {
  status: "queued",
  attempts: 0,
  maxAttempts: 3,
  lastError: "",
  claimedAt: null,
  runAfter: null,
  finishedAt: null,
  laneBusy: false,
}

describe("where a job has got to", () => {
  it("blames the stopped program first, since nothing else will start without it", () => {
    expect(jobStatusText({ ...waiting, laneBusy: true }, false, now)).toBe(
      "Waiting. The browser program is not running."
    )
  })

  it("says a job held back for later waits until then", () => {
    expect(jobStatusText({ ...waiting, runAfter: new Date("2026-10-13T15:00:00Z") }, true, now)).toMatch(/^Waits until today at /)
  })

  it("says it waits behind the job running in its browser", () => {
    expect(jobStatusText({ ...waiting, laneBusy: true }, true, now)).toBe(
      "Waits for the job ahead of it in the same browser"
    )
  })

  it("says which try comes next after a failed one, and why it failed", () => {
    expect(jobStatusText({ ...waiting, attempts: 1, lastError: "Reddit timed out" }, true, now)).toBe(
      "Try 2 of 3 next. Last try: Reddit timed out"
    )
  })

  it("says how long a running job has been going", () => {
    expect(jobStatusText({ ...waiting, status: "running", claimedAt: new Date(now.getTime() - 90_000) }, true, now)).toBe(
      "Running for 1m"
    )
  })

  it("gives a failed job's reason", () => {
    expect(jobStatusText({ ...waiting, status: "failed", lastError: "No reader picked" }, true, now)).toBe("No reader picked")
  })
})

describe("the line about the browser program", () => {
  it("counts what is held up while it is stopped", () => {
    expect(programText({ running: false, seenAt: null, startedAt: null }, 22, now)).toBe(
      "Not running, so nothing is searched, read or posted. 22 jobs are waiting."
    )
  })

  it("says nothing is held up when the queue is empty", () => {
    expect(programText({ running: false, seenAt: null, startedAt: null }, 0, now)).toBe(
      "Not running. Nothing is waiting, so nothing is held up yet."
    )
  })
})

describe("which failed jobs can be put back", () => {
  it("puts back a read but never a write, which may already be on Reddit", () => {
    expect(canRetryJob("search")).toBe(true)
    expect(canRetryJob("comment")).toBe(false)
    expect(canRetryJob("delete_comment")).toBe(false)
  })
})
