import * as React from "react"

import { loadTradeSoundEvents } from "@/lib/api/trade/notice-links"
import { loadTradeSoundSettings } from "@/lib/api/trade/trade-sound-settings"
import {
  consumeTradeSoundBootstrap,
  ensureTradeSoundSetting,
  playTradeSound,
  readTradeSoundBootstrap,
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
  const [opening] = React.useState(readTradeSoundBootstrap)
  const rememberedSetting = useRememberedTradeSoundSetting()
  const enabled = rememberedSetting ?? false
  const cursor = React.useRef<TradeSoundCursor | null>(
    opening?.error === null ? opening.cursor : null
  )
  const playedOpeningEvents = React.useRef(false)
  const reading = React.useRef(false)
  const interacted = React.useRef(
    typeof navigator !== "undefined" &&
      Boolean(navigator.userActivation?.hasBeenActive)
  )

  React.useEffect(() => {
    if (opening) consumeTradeSoundBootstrap(opening)
    cursor.current ??= { afterAt: Date.now(), afterId: "" }
    if (rememberedSetting === undefined) {
      void ensureTradeSoundSetting(loadTradeSoundSettings).catch(() => {
        // Off is the safe answer when the preference read fails.
      })
    }
    if (
      !playedOpeningEvents.current &&
      opening?.error === null &&
      opening.enabled
    ) {
      playedOpeningEvents.current = true
      for (const event of opening.events) {
        void playTradeSound(event.kind, interacted.current)
      }
    }
  }, [opening, rememberedSetting])

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
        void playTradeSound(event.kind, interacted.current)
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

    // The bootstrap query finishes before this stream subscribes. Catch the
    // narrow gap once on open; this stream does not replay a notice that
    // landed before its subscription existed.
    source.onopen = ask
    source.onmessage = ask
    const poll = window.setInterval(ask, FALLBACK_POLL_MS)
    return () => {
      source.close()
      window.clearInterval(poll)
      if (debounce) clearTimeout(debounce)
    }
  }, [enabled, opening, sync])
}
