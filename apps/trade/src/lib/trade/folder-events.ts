/** Deletion notices contain only an id, never account holdings or credentials. */
const channelName = "trade-folder-deleted"
const listeners = new Set<(id: string) => void>()
export function publishFolderDeleted(id: string) {
  listeners.forEach((listener) => listener(id))
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName)
    channel.postMessage(id)
    channel.close()
  }
}
export function subscribeFolderDeleted(listener: (id: string) => void) {
  listeners.add(listener)
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(channelName)
      : null
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data === "string") listener(event.data)
    }
  return () => {
    listeners.delete(listener)
    channel?.close()
  }
}
