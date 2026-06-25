import * as React from "react"

export function useAudioPreview() {
  const [previewingId, setPreviewingId] = React.useState<string | null>(null)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  const stopPreview = React.useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      audioRef.current = null
    }
    setPreviewingId(null)
  }, [])

  React.useEffect(() => stopPreview, [stopPreview])

  const togglePreview = React.useCallback(
    (id: string, url: string) => {
      if (previewingId === id) {
        stopPreview()
        return
      }

      stopPreview()
      const audio = new Audio(url)
      audioRef.current = audio
      audio.addEventListener("ended", stopPreview, { once: true })
      audio.addEventListener("error", stopPreview, { once: true })
      setPreviewingId(id)
      void audio.play().catch(stopPreview)
    },
    [previewingId, stopPreview]
  )

  return { previewingId, stopPreview, togglePreview }
}
