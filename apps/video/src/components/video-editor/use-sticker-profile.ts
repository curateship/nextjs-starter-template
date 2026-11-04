import { useMatch } from "@tanstack/react-router"

import { useProjectGuest } from "@/components/video-editor/project-guest"

/**
 * The name and round picture a new social sticker starts with: the signed-in
 * person's own, from their profile. A guest sent from Project has a name and
 * no picture. Each sticker can change both afterwards.
 */
export function useStickerProfile(): { name: string; pictureUrl: string | null } {
  const guest = useProjectGuest()
  const signedIn = useMatch({ from: "/_authenticated", shouldThrow: false })
  if (guest) return { name: guest.name, pictureUrl: null }
  const user = signedIn?.loaderData?.user
  return { name: user?.name ?? "", pictureUrl: user?.avatarUrl || null }
}
