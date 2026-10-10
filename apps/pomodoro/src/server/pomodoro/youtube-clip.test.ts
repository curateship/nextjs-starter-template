import { EventEmitter } from "node:events"
import { writeFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({ spawn: vi.fn(), execFile: vi.fn() }))

import { execFile, spawn } from "node:child_process"

import {
  downloadYoutubeClip,
  YoutubeClipRefusedError,
  YT_DLP_MISSING_MESSAGE,
} from "@/server/pomodoro/youtube-clip"

/**
 * The clip cutter with both programs replaced: yt-dlp prints what the real
 * one would, and FFmpeg writes (or fails to write) the clip.
 */

type FakeYtDlp = { info?: Record<string, unknown>; stderr?: string; missing?: boolean }
type FakeFfmpeg = { clip?: Uint8Array; error?: Error & { code?: string; stderr?: string } }

function fakePrograms(ytDlp: FakeYtDlp, ffmpeg: FakeFfmpeg = {}) {
  vi.mocked(spawn).mockImplementation((() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    })
    setImmediate(() => {
      if (ytDlp.missing) {
        child.emit("error", Object.assign(new Error("spawn yt-dlp ENOENT"), { code: "ENOENT" }))
        return
      }
      if (ytDlp.info) child.stdout.emit("data", Buffer.from(`${JSON.stringify(ytDlp.info)}\n`))
      if (ytDlp.stderr) child.stderr.emit("data", Buffer.from(ytDlp.stderr))
      child.emit("close", ytDlp.info ? 0 : 1)
    })
    return child
  }) as unknown as typeof spawn)

  vi.mocked(execFile).mockImplementation(((
    _command: string,
    args: string[],
    _options: unknown,
    done: (error: Error | null, stdout: string, stderr: string) => void
  ) => {
    if (ffmpeg.error) done(ffmpeg.error, "", "")
    else {
      writeFileSync(args.at(-1)!, ffmpeg.clip ?? new Uint8Array())
      done(null, "", "")
    }
  }) as unknown as typeof execFile)
}

const CLIP = new Uint8Array([1, 2, 3, 4])
const INFO = {
  title: "Big Buck Bunny",
  channel: "Blender",
  duration: 635,
  url: "https://rr4.googlevideo.com/videoplayback?itag=401&sig=abc",
  http_headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" },
}

afterEach(() => {
  vi.mocked(spawn).mockReset()
  vi.mocked(execFile).mockReset()
})

describe("downloadYoutubeClip", () => {
  it("asks yt-dlp for the 4K stream, downloads nothing with it, and has FFmpeg cut 5 seconds into H.264", async () => {
    fakePrograms({ info: INFO }, { clip: CLIP })

    expect(await downloadYoutubeClip("aqz-KE-bpKQ", 95)).toEqual({
      bytes: CLIP,
      title: "Big Buck Bunny",
      channel: "Blender",
    })
    const ytDlpArgs = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(ytDlpArgs).toContain("bv*[height<=2160][protocol=https]/bv*[height<=2160]")
    expect(ytDlpArgs).toContain(`node:${process.execPath}`)
    expect(ytDlpArgs).not.toContain("--no-simulate")
    expect(ytDlpArgs.at(-1)).toBe("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=95")

    const ffmpegArgs = vi.mocked(execFile).mock.calls[0][1] as string[]
    const after = (flag: string) => ffmpegArgs[ffmpegArgs.indexOf(flag) + 1]
    expect(after("-ss")).toBe("95")
    expect(after("-i")).toBe(INFO.url)
    expect(after("-t")).toBe("5")
    expect(after("-c:v")).toBe("libx264")
    expect(after("-headers")).toBe("User-Agent: Mozilla/5.0\r\nAccept: */*\r\n")
    expect(after("-protocol_whitelist")).toBe("https,tls,tcp")
    expect(ffmpegArgs).toContain("-an")
    expect(ffmpegArgs).not.toContain("-vf")
  })

  it("never points FFmpeg at anything but an https stream", async () => {
    fakePrograms({ info: { ...INFO, url: "file:///etc/passwd" } }, { clip: CLIP })

    await expect(downloadYoutubeClip("aqz-KE-bpKQ", 95)).rejects.toThrow("yt-dlp named no stream to read")
    expect(execFile).not.toHaveBeenCalled()
  })

  it("drops a header holding a line break", async () => {
    fakePrograms(
      { info: { ...INFO, http_headers: { "User-Agent": "Mozilla/5.0", Bad: "x\r\nInjected: yes" } } },
      { clip: CLIP }
    )
    await downloadYoutubeClip("aqz-KE-bpKQ", 95)

    const ffmpegArgs = vi.mocked(execFile).mock.calls[0][1] as string[]
    expect(ffmpegArgs[ffmpegArgs.indexOf("-headers") + 1]).toBe("User-Agent: Mozilla/5.0\r\n")
  })

  it("refuses a start too close to the end before cutting anything", async () => {
    fakePrograms({ info: { ...INFO, duration: 200 } })

    await expect(downloadYoutubeClip("aqz-KE-bpKQ", 199)).rejects.toThrow(
      new YoutubeClipRefusedError("The video is only 3:20 long, so the clip must start by 3:15.")
    )
    expect(execFile).not.toHaveBeenCalled()
  })

  it("refuses a live stream", async () => {
    fakePrograms({ info: { ...INFO, duration: null, is_live: true } })

    await expect(downloadYoutubeClip("aqz-KE-bpKQ", 0)).rejects.toBeInstanceOf(YoutubeClipRefusedError)
  })

  it("keeps yt-dlp's own words when YouTube says nothing about the video", async () => {
    fakePrograms({
      stderr: "WARNING: old\nERROR: [youtube] aqz-KE-bpKQ: Private video. Sign in if you've been granted access\n",
    })

    await expect(downloadYoutubeClip("aqz-KE-bpKQ", 0)).rejects.toThrow(
      new YoutubeClipRefusedError("Private video. Sign in if you've been granted access")
    )
  })

  it("tries again after a blip, such as YouTube asking the server to slow down", async () => {
    fakePrograms({ stderr: "ERROR: [youtube] aqz-KE-bpKQ: HTTP Error 429: Too Many Requests\n" })
    const throttled = await downloadYoutubeClip("aqz-KE-bpKQ", 0).catch((caught: unknown) => caught)
    expect(throttled).not.toBeInstanceOf(YoutubeClipRefusedError)
    expect((throttled as Error).message).toBe("HTTP Error 429: Too Many Requests")

    fakePrograms({ stderr: "ERROR: [youtube] aqz-KE-bpKQ: HTTP Error 503: Service Unavailable\n" })
    const busy = await downloadYoutubeClip("aqz-KE-bpKQ", 0).catch((caught: unknown) => caught)
    expect(busy).not.toBeInstanceOf(YoutubeClipRefusedError)

    // Killed by the time limit: nothing printed at all.
    fakePrograms({})
    const silent = await downloadYoutubeClip("aqz-KE-bpKQ", 0).catch((caught: unknown) => caught)
    expect(silent).not.toBeInstanceOf(YoutubeClipRefusedError)
  })

  it("fails a video that does not exist at once, in yt-dlp's words", async () => {
    fakePrograms({ stderr: "ERROR: [youtube] aaaaaaaaaaa: This video is unavailable\n" })

    await expect(downloadYoutubeClip("aaaaaaaaaaa", 0)).rejects.toThrow(
      new YoutubeClipRefusedError("This video is unavailable")
    )
  })

  it("names YouTube's bot check plainly", async () => {
    fakePrograms({ stderr: "ERROR: [youtube] aqz-KE-bpKQ: Sign in to confirm you’re not a bot.\n" })

    await expect(downloadYoutubeClip("aqz-KE-bpKQ", 0)).rejects.toThrow(
      new YoutubeClipRefusedError("YouTube refused the server. Tyler has to decide how to get round it.")
    )
  })

  it("treats a failed cut as worth another try, and keeps the signed address out of the error", async () => {
    fakePrograms(
      { info: INFO },
      {
        error: Object.assign(new Error(`Command failed: ffmpeg -i ${INFO.url}`), {
          stderr: "Server returned 403 Forbidden (access denied)\n",
        }),
      }
    )

    const error = await downloadYoutubeClip("aqz-KE-bpKQ", 95).catch((caught: unknown) => caught)
    expect(error).not.toBeInstanceOf(YoutubeClipRefusedError)
    expect((error as Error).message).toBe(
      "FFmpeg could not cut the clip: Server returned 403 Forbidden (access denied)"
    )
  })

  it("says so when yt-dlp or FFmpeg is not installed", async () => {
    fakePrograms({ missing: true })
    await expect(downloadYoutubeClip("aqz-KE-bpKQ", 0)).rejects.toThrow(
      new YoutubeClipRefusedError(YT_DLP_MISSING_MESSAGE)
    )

    fakePrograms({ info: INFO }, { error: Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" }) })
    await expect(downloadYoutubeClip("aqz-KE-bpKQ", 0)).rejects.toThrow(
      new YoutubeClipRefusedError("FFmpeg is not installed on this server")
    )
  })
})
