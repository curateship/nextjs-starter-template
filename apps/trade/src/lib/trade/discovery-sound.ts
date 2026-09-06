let context: AudioContext | null = null

/** Call from a click so browsers may allow later sounds from this page. */
export function primeDiscoverySound() {
  try {
    context ??= new AudioContext()
    return context.resume().then(
      () => context?.state === "running",
      () => false
    )
  } catch {
    return Promise.resolve(false)
  }
}

export function playDiscoverySound() {
  if (!context || context.state !== "running") return
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.frequency.setValueAtTime(660, context.currentTime)
  oscillator.frequency.setValueAtTime(880, context.currentTime + 0.09)
  gain.gain.setValueAtTime(0.08, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.21)
  oscillator.onended = () => {
    oscillator.disconnect()
    gain.disconnect()
  }
}
