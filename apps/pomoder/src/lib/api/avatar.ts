import { cropToSquareAvatar } from "@/lib/avatar-image"

type AvatarResponse = { avatarMediaId: string | null }

export async function uploadAvatar(file: File): Promise<AvatarResponse> {
  const square = await cropToSquareAvatar(file)
  const form = new FormData()
  form.set("file", square, "avatar.jpg")
  return request("POST", form)
}

export async function removeAvatar(): Promise<AvatarResponse> {
  return request("DELETE")
}

export function getAvatarErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (code.includes("AVATAR_NOT_AN_IMAGE")) return "That file is not an image. Choose a PNG, JPEG or WebP."
  if (code.includes("AVATAR_SOURCE_TOO_LARGE")) return "That image is too big to open. Choose one under 12 MB."
  if (code.includes("FILE_TOO_LARGE")) return "That picture is too large. Choose a smaller image."
  if (code.includes("INVALID_FILE_CONTENT")) return "That file could not be read as an image."
  if (code.includes("RATE_LIMITED")) return "You have changed your picture a lot recently. Try again later."
  if (code.includes("AUTH_REQUIRED")) return "Sign in again to change your picture."
  return "Your profile picture could not be saved. Try again."
}

async function request(method: "POST" | "DELETE", body?: FormData): Promise<AvatarResponse> {
  const response = await fetch("/api/avatar", { method, body })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error?.code || "AVATAR_REQUEST_FAILED")
  return payload.data as AvatarResponse
}
