import * as React from "react"

import {
  cancelSleepTimer,
  ensureSoundEngine,
  setChime,
  setCompletionAlerts,
  setVolume,
  soundEngineState,
  startSleepTimer,
  subscribeSoundEngine,
  toggleMuted,
  togglePlayback,
  type SoundEngineSnapshot,
} from "@/lib/pomodoro/sound-engine"

const serverSnapshot: SoundEngineSnapshot = soundEngineState()

/** React's view of the module-level sound engine. */
export function useSoundPlayer() {
  const state = React.useSyncExternalStore(
    subscribeSoundEngine,
    soundEngineState,
    () => serverSnapshot
  )
  React.useEffect(() => {
    ensureSoundEngine()
  }, [])
  return {
    state,
    togglePlayback,
    setVolume,
    toggleMuted,
    setCompletionAlerts,
    setChime,
    startSleepTimer,
    cancelSleepTimer,
  }
}
