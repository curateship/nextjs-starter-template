const EVENT_NAME = "trade-header-profit-visibility"

export function publishHeaderProfitVisibility(visible: boolean) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<boolean>(EVENT_NAME, { detail: visible })
  )
}

export function listenForHeaderProfitVisibility(
  listener: (visible: boolean) => void
) {
  if (typeof window === "undefined") return () => undefined
  const onChange = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === "boolean") {
      listener(event.detail)
    }
  }
  window.addEventListener(EVENT_NAME, onChange)
  return () => window.removeEventListener(EVENT_NAME, onChange)
}
