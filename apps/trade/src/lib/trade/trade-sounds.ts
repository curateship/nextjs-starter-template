export type TradeSoundKind = "fill" | "stop"

export type TradeSoundEvent = {
  id: string
  kind: TradeSoundKind
  createdAt: number
}

export type TradeSoundCursor = {
  afterAt: number
  afterId: string
}

/** A burst of the same event should be heard once, not once per rung. */
export const TRADE_SOUND_COLLAPSE_MS = 2_000

/** Carries the account switch to other open tabs without carrying sound events. */
export const TRADE_SOUND_SETTINGS_CHANNEL = "trade-sound-settings"

export const TRADE_SOUND_FILES: Record<TradeSoundKind, string> = {
  fill: "/sounds/trade-fill.wav",
  stop: "/sounds/trade-stop.wav",
}

let rememberedSetting: boolean | undefined
let settingLoad: Promise<boolean> | null = null
const settingListeners = new Set<() => void>()

/** The account switch is read once, then reused while this signed-in app stays open. */
export function readRememberedTradeSoundSetting() {
  return rememberedSetting
}

export function rememberTradeSoundSetting(enabled: boolean | undefined) {
  if (rememberedSetting === enabled) return
  rememberedSetting = enabled
  for (const listener of settingListeners) listener()
}

export function subscribeToTradeSoundSetting(listener: () => void) {
  settingListeners.add(listener)
  return () => {
    settingListeners.delete(listener)
  }
}

/** Shares one in-flight read between the listener and the Settings card. */
export function ensureTradeSoundSetting(
  load: () => Promise<{ enabled: boolean }>
) {
  if (rememberedSetting !== undefined) {
    return Promise.resolve(rememberedSetting)
  }
  if (settingLoad) return settingLoad

  settingLoad = load()
    .then((answer) => {
      if (rememberedSetting === undefined) {
        rememberTradeSoundSetting(answer.enabled)
      }
      return rememberedSetting ?? answer.enabled
    })
    .finally(() => {
      settingLoad = null
    })
  return settingLoad
}

/**
 * Plays one sound per kind inside the collapse window.
 *
 * The browser's audio promise is deliberately ignored. A tab with no user
 * interaction is expected to be refused, and the bell notice still arrives.
 */
export function createTradeSoundPlayer({
  audio = (src) => new Audio(src),
  now = Date.now,
}: {
  audio?: (src: string) => Pick<HTMLAudioElement, "play">
  now?: () => number
} = {}) {
  const lastPlayedAt: Partial<Record<TradeSoundKind, number>> = {}

  return (kind: TradeSoundKind, interacted: boolean) => {
    if (!interacted) return false
    const at = now()
    const last = lastPlayedAt[kind]
    if (last !== undefined && at - last < TRADE_SOUND_COLLAPSE_MS) return false
    lastPlayedAt[kind] = at
    try {
      void audio(TRADE_SOUND_FILES[kind])
        .play()
        .catch(() => undefined)
    } catch {
      // Some browsers refuse before returning a promise. Silence is expected.
    }
    return true
  }
}
