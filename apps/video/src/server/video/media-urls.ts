import { getPublicMediaUrl } from "@/server/media/storage"

/**
 * Where the editor plays a piece of media from.
 *
 * One rule in one place: play the smooth copy once it exists, otherwise the
 * original file. Both the media list and a project's timeline resolve their
 * addresses through here, so a clip on the timeline and the same file in the
 * media panel can never disagree about which copy is being played.
 *
 * Both addresses point straight at the storage bucket, exactly as the shell's
 * own library does. That is not only simpler than streaming through the app —
 * a `<video>` element asking an app route for byte ranges is refused outright
 * by the dev server, so a copy served that way would never play while
 * developing. A rebuilt copy is written under a new name, so its address
 * changes with it and nothing can serve a stale one.
 */

export type VideoProxyState = {
  status: string
  storagePath: string | null
} | null

export function videoPlaybackUrl(originalUrl: string, proxy: VideoProxyState) {
  return proxy?.status === "ready" && proxy.storagePath
    ? getPublicMediaUrl(proxy.storagePath)
    : originalUrl
}
