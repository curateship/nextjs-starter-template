import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createDefaultVoiceSettings,
  pickVoiceSettings,
  voiceDefaultsSchema,
  voiceoverRequestBody,
  voiceSettingsSchema,
  type VoiceDefaults,
} from "../lib/voice-settings.ts"

const savedDefaults: VoiceDefaults = {
  voiceId: "voice-1",
  voiceName: "Rachel",
  modelId: "eleven_multilingual_v2",
  stability: 0.4,
  similarityBoost: 0.8,
  styleExaggeration: 0.2,
  speed: 1.1,
  speakerBoost: false,
}

describe("voice settings", () => {
  it("uses the ElevenLabs baseline as the default style", () => {
    const defaults = createDefaultVoiceSettings()
    assert.deepEqual(defaults, {
      stability: 0.5,
      similarityBoost: 0.75,
      styleExaggeration: 0,
      speed: 1,
      speakerBoost: true,
    })
    assert.equal(voiceSettingsSchema.safeParse(defaults).success, true)
  })

  it("validates style ranges", () => {
    const defaults = createDefaultVoiceSettings()
    for (const invalid of [
      { ...defaults, stability: -0.1 },
      { ...defaults, stability: 1.1 },
      { ...defaults, similarityBoost: 1.5 },
      { ...defaults, styleExaggeration: 2 },
      { ...defaults, speed: 0.6 },
      { ...defaults, speed: 1.3 },
      { ...defaults, speakerBoost: "yes" },
    ]) {
      assert.equal(voiceSettingsSchema.safeParse(invalid).success, false)
    }
  })

  it("validates saved defaults and rejects unknown keys", () => {
    assert.equal(voiceDefaultsSchema.safeParse(savedDefaults).success, true)
    assert.equal(
      voiceDefaultsSchema.safeParse({ ...savedDefaults, voiceId: "" }).success,
      false
    )
    assert.equal(
      voiceDefaultsSchema.safeParse({ ...savedDefaults, modelId: "gpt-4o" })
        .success,
      false
    )
    assert.equal(
      voiceDefaultsSchema.safeParse({ ...savedDefaults, extra: true }).success,
      false
    )
  })

  it("normalizes saved defaults to a request style", () => {
    const style = pickVoiceSettings(savedDefaults)
    assert.deepEqual(style, {
      stability: 0.4,
      similarityBoost: 0.8,
      styleExaggeration: 0.2,
      speed: 1.1,
      speakerBoost: false,
    })
    // Strict request schemas must accept the picked style (no leftover keys).
    assert.equal(voiceSettingsSchema.safeParse(style).success, true)
  })

  it("sends request-level voice_settings when a style is provided", () => {
    assert.deepEqual(
      voiceoverRequestBody("Hi", "eleven_multilingual_v2", {
        stability: 0.4,
        similarityBoost: 0.8,
        styleExaggeration: 0.2,
        speed: 1.1,
        speakerBoost: false,
      }),
      {
        text: "Hi",
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.2,
          speed: 1.1,
          use_speaker_boost: false,
        },
      }
    )
  })

  it("keeps the payload unchanged without a style", () => {
    assert.deepEqual(voiceoverRequestBody("Hi", "eleven_flash_v2_5"), {
      text: "Hi",
      model_id: "eleven_flash_v2_5",
    })
  })
})
