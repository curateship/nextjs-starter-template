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

type TradeSoundAudio = Pick<HTMLAudioElement, "play"> &
  Partial<Pick<HTMLAudioElement, "currentTime" | "pause" | "volume">>

let rememberedSetting: boolean | undefined
let settingLoad: Promise<boolean> | null = null
const settingListeners = new Set<() => void>()

export type TradeSoundBootstrap = {
  enabled: boolean
  events: TradeSoundEvent[]
  cursor: TradeSoundCursor
  error: string | null
}

let openingSoundAnswer: TradeSoundBootstrap | null = null
let seededSoundAnswer: TradeSoundBootstrap | null = null

/**
 * Fill the browser copy from a dashboard answer without replacing a newer
 * setting changed in this tab. The listener reads the cursor to avoid asking
 * for the same opening slice again when its event stream connects.
 */
export function seedTradeSounds(answer: TradeSoundBootstrap) {
  if (seededSoundAnswer === answer) return
  seededSoundAnswer = answer
  openingSoundAnswer = answer
  if (answer.error === null && rememberedSetting === undefined) {
    rememberTradeSoundSetting(answer.enabled)
  }
}

export function readTradeSoundBootstrap() {
  return openingSoundAnswer
}

export function consumeTradeSoundBootstrap(answer: TradeSoundBootstrap) {
  if (openingSoundAnswer === answer) openingSoundAnswer = null
}

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
 * The caller may inspect the result for a Settings preview. Live events ignore
 * it so a browser refusal never competes with the bell notice.
 */
export function createTradeSoundPlayer({
  audio = (src) => new Audio(src),
  now = Date.now,
}: {
  audio?: (src: string) => TradeSoundAudio
  now?: () => number
} = {}) {
  const lastPlayedAt: Partial<Record<TradeSoundKind, number>> = {}
  const players: Partial<Record<TradeSoundKind, TradeSoundAudio>> = {}

  const playerFor = (kind: TradeSoundKind) =>
    (players[kind] ??= audio(TRADE_SOUND_FILES[kind]))

  const attempt = async (player: TradeSoundAudio) => {
    try {
      await player.play()
      return true
    } catch {
      return false
    }
  }

  const play = async (
    kind: TradeSoundKind,
    interacted: boolean,
    collapse = true
  ) => {
    if (!interacted) return false
    const at = now()
    const last = lastPlayedAt[kind]
    if (collapse && last !== undefined && at - last < TRADE_SOUND_COLLAPSE_MS) {
      return false
    }
    lastPlayedAt[kind] = at
    let player: TradeSoundAudio
    try {
      player = playerFor(kind)
    } catch {
      if (lastPlayedAt[kind] === at) delete lastPlayedAt[kind]
      return false
    }
    const played = await attempt(player)
    if (!played) {
      // A refused attempt must not suppress a retry made from a later click.
      if (lastPlayedAt[kind] === at) delete lastPlayedAt[kind]
    }
    return played
  }

  return Object.assign(play, {
    /**
     * Starts both retained elements inside the Settings click. WebKit grants
     * audio permission per element, so the silent stop attempt matters even
     * after the audible fill preview succeeds.
     */
    prime: async () => {
      const fillAttempt = play("fill", true, false)
      let stop: TradeSoundAudio
      try {
        stop = playerFor("stop")
      } catch {
        await fillAttempt
        return false
      }

      const previousVolume = stop.volume
      try {
        if (previousVolume !== undefined) stop.volume = 0
        const stopAttempt = attempt(stop)
        const [fillPlayed, stopPlayed] = await Promise.all([
          fillAttempt,
          stopAttempt,
        ])

        if (stopPlayed) {
          stop.pause?.()
          if (stop.currentTime !== undefined) stop.currentTime = 0
        }
        return fillPlayed && stopPlayed
      } catch {
        await fillAttempt
        return false
      } finally {
        if (previousVolume !== undefined) stop.volume = previousVolume
      }
    },
  })
}

let browserPlayer: ReturnType<typeof createTradeSoundPlayer> | null = null

/** One retained player per tab, shared by the Settings preview and live events. */
export function playTradeSound(
  kind: TradeSoundKind,
  interacted: boolean,
  collapse = true
) {
  browserPlayer ??= createTradeSoundPlayer()
  return browserPlayer(kind, interacted, collapse)
}

/** Audible fill preview plus a silent permission check for the stop player. */
export function primeTradeSounds() {
  browserPlayer ??= createTradeSoundPlayer()
  return browserPlayer.prime()
}
