import { spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { runFfmpeg } from "@/server/video/ffmpeg"

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0

describe("stopping ffmpeg partway", () => {
  it.skipIf(!hasFfmpeg)(
    "kills a long run and settles only once the process has gone",
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "ffmpeg-stop-"))
      try {
        const out = path.join(dir, "out.mp4")
        const stop = new AbortController()
        // A minute of test picture, far longer than the test waits.
        const run = runFfmpeg(
          ["-f", "lavfi", "-i", "testsrc=duration=60", out],
          "failed",
          stop.signal
        )
        setTimeout(() => stop.abort(new Error("stopped")), 300)

        const startedAt = Date.now()
        await expect(run).rejects.toThrowError("stopped")
        expect(Date.now() - startedAt).toBeLessThan(2_000)

        // The promise settled, so no ffmpeg writing to this folder is left.
        const processes = spawnSync("ps", ["-axo", "command"], {
          encoding: "utf8",
        }).stdout
        expect(processes).not.toContain(out)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }
  )

  it("never starts a run that was stopped before it began", async () => {
    const stop = new AbortController()
    stop.abort(new Error("stopped"))
    await expect(
      runFfmpeg(["-version"], "failed", stop.signal)
    ).rejects.toThrowError("stopped")
  })
})
