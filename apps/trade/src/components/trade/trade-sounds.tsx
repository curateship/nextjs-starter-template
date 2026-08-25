import * as React from "react"

import { loadTradeSoundEvents } from "@/lib/api/notice-links"
import { loadTradeSoundSettings } from "@/lib/api/trade-sound-settings"
import {
  createTradeSoundPlayer,
  ensureTradeSoundSetting,
  readRememberedTradeSoundSetting,
  rememberTradeSoundSetting,
  subscribeToTradeSoundSetting,
  TRADE_SOUND_SETTINGS_CHANNEL,
  type TradeSoundCursor,
} from "@/lib/trade/trade-sounds"

const STREAM_PATH = "/api/v1/notifications/stream"
const NUDGE_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 60_000

export function useRememberedTradeSoundSetting() {
  return React.useSyncExternalStore(
    subscribeToTradeSoundSetting,
    readRememberedTradeSoundSetting,
    readRememberedTradeSoundSetting
  )
}

/** Fill and stop sounds for one open Trade screen. */
export function useTradeSounds() {
  const rememberedSetting = useRememberedTradeSoundSetting()
  const enabled = rememberedSetting ?? false
  const cursor = React.useRef<TradeSoundCursor | null>(null)
  const reading = React.useRef(false)
  const interacted = React.useRef(
    typeof navigator !== "undefined" &&
      Boolean(navigator.userActivation?.hasBeenActive)
  )
  const play = React.useRef(createTradeSoundPlayer())

  React.useEffect(() => {
    cursor.current = { afterAt: Date.now(), afterId: "" }
    void ensureTradeSoundSetting(loadTradeSoundSettings).catch(() => {
      // Off is the safe answer when the preference read fails.
    })
  }, [])

  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(TRADE_SOUND_SETTINGS_CHANNEL)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data === "boolean") {
        rememberTradeSoundSetting(event.data)
      }
    }
    return () => channel.close()
  }, [])

  React.useEffect(() => {
    const mark = () => {
      interacted.current = true
    }
    window.addEventListener("pointerdown", mark, { once: true })
    window.addEventListener("keydown", mark, { once: true })
    return () => {
      window.removeEventListener("pointerdown", mark)
      window.removeEventListener("keydown", mark)
    }
  }, [])

  const sync = React.useCallback(async () => {
    if (!enabled || reading.current || cursor.current === null) return
    reading.current = true
    try {
      const answer = await loadTradeSoundEvents(cursor.current)
      cursor.current = answer.cursor
      for (const event of answer.events) {
        play.current(event.kind, interacted.current)
      }
    } catch {
      // The notice is already in the bell. A sound read must not add an error.
    } finally {
      reading.current = false
    }
  }, [enabled])

  // This connection stays open while the tab is hidden. The bell's shared
  // stream closes then to save a browser connection, but hearing a fill while
  // looking at another window is the reason this listener exists.
  React.useEffect(() => {
    if (!enabled) return
    const source = new EventSource(STREAM_PATH)
    let debounce: ReturnType<typeof setTimeout> | null = null
    const ask = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void sync()
      }, NUDGE_DEBOUNCE_MS)
    }

    source.onopen = ask
    source.onmessage = ask
    const poll = window.setInterval(ask, FALLBACK_POLL_MS)
    return () => {
      source.close()
      window.clearInterval(poll)
      if (debounce) clearTimeout(debounce)
    }
  }, [enabled, sync])
}
