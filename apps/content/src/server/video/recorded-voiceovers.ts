import {
  RECORDED_VOICE_ID,
  RECORDED_VOICE_NAME,
  RECORDING_CAPTIONS_FEATURE,
  RECORDING_HEARD_NOTHING_NOTICE,
  RECORDING_NO_KEY_NOTICE,
  RECORDING_UNREADABLE_MESSAGE,
  RECORDING_UNTIMED_NOTICE,
  recordingRefusal,
  wavDurationMs,
} from "@/lib/video/recorded-voiceover"
import {
  timeScriptWords,
  wordsToCaptions,
  type VoiceoverResult,
} from "@/lib/video/voice"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import type { SpendTag } from "@/server/video/project-spend"
import { keepInLibrary } from "@/server/video/voice"
import { transcribeWithWhisper } from "@/server/video/whisper"

/**
 * A voiceover somebody recorded themselves
 * (workspace/docs/record-a-voiceover.md).
 *
 * The browser sends a WAV file, so its length is read from its own header and
 * nothing here needs ffmpeg, which the website does not have. Whisper writes
 * down what was said and when, for the captions, and is the only part that
 * costs anything. The recording is kept whatever Whisper does: a take cannot
 * be made again for free, so a missing key or a failed call keeps it without
 * captions and says why.
 */
export async function keepRecordedVoiceover({
  userId,
  bytes,
  spend,
}: {
  userId: string
  bytes: Uint8Array
  /** The video it was recorded for, so its spend line counts the captions. */
  spend?: SpendTag | null
}): Promise<VoiceoverResult> {
  const durationMs = wavDurationMs(bytes)
  const refusal = recordingRefusal(bytes.byteLength, durationMs)
  if (refusal) throw new Error(refusal)
  if (durationMs === null) throw new Error(RECORDING_UNREADABLE_MESSAGE)

  const heard = await writeDownRecording({ userId, bytes, durationMs, spend })
  const script = heard.kind === "heard" ? heard.text : ""
  const captions =
    heard.kind === "heard"
      ? wordsToCaptions(timeScriptWords(heard.text, heard.words, durationMs))
      : []
  const stored = await keepInLibrary(
    userId,
    bytes,
    {
      script,
      voiceId: RECORDED_VOICE_ID,
      voiceName: RECORDED_VOICE_NAME,
      durationMs,
      captions,
    },
    "wav"
  )
  return {
    ...stored,
    durationMs,
    captions,
    ...(heard.kind === "heard" ? {} : { notice: heard.notice }),
  }
}

type Heard =
  | { kind: "heard"; text: string; words: { text: string; startMs: number; endMs: number }[] }
  | { kind: "not-heard"; notice: string }

/** What Whisper heard in the recording, or why there are no captions. */
async function writeDownRecording({
  userId,
  bytes,
  durationMs,
  spend,
}: {
  userId: string
  bytes: Uint8Array
  durationMs: number
  spend?: SpendTag | null
}): Promise<Heard> {
  const apiKey = await getAiKey("openai")
  if (!apiKey) return { kind: "not-heard", notice: RECORDING_NO_KEY_NOTICE }
  try {
    const answer = await runAiCall(
      {
        userId,
        provider: "openai",
        model: "whisper-1",
        feature: RECORDING_CAPTIONS_FEATURE,
        metadata: { ...spend },
      },
      async () => ({
        result: await transcribeWithWhisper({
          apiKey,
          audio: bytes,
          label: "Writing down the recording",
          format: "wav",
        }),
        // Whisper bills the minutes it listens to.
        usage: { inputTokens: 0, outputTokens: 0, units: durationMs / 60_000 },
      })
    )
    const text = answer.text || answer.words.map((word) => word.text).join(" ")
    if (!answer.words.length || !text.trim()) {
      return { kind: "not-heard", notice: RECORDING_HEARD_NOTHING_NOTICE }
    }
    return { kind: "heard", text: text.trim(), words: answer.words }
  } catch (error) {
    console.error("Recording captions failed; kept without them", error)
    return { kind: "not-heard", notice: RECORDING_UNTIMED_NOTICE }
  }
}
