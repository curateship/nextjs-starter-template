function encodePathPart(value: string) {
  return encodeURIComponent(value)
}

function cacheVersion(value?: Date | null) {
  return value ? `?v=${encodeURIComponent(value.toISOString())}` : ""
}

export function mediaFileUrl(mediaId: string) {
  return `/api/v1/media/${encodePathPart(mediaId)}/file`
}

export function mediaProxyUrl(mediaId: string, generatedAt?: Date | null) {
  return `/api/v1/media/${encodePathPart(mediaId)}/proxy${cacheVersion(generatedAt)}`
}

export function actorImageUrl(actorId: string, updatedAt?: Date | null) {
  return `/api/v1/actors/${encodePathPart(actorId)}/image${cacheVersion(updatedAt)}`
}

export function creatorAvatarUrl(creatorId: string, updatedAt?: Date | null) {
  return `/api/v1/creators/${encodePathPart(creatorId)}/avatar${cacheVersion(updatedAt)}`
}

export function viralVideoThumbnailUrl(
  videoId: string,
  updatedAt?: Date | null
) {
  return `/api/v1/viral-videos/${encodePathPart(videoId)}/thumbnail${cacheVersion(updatedAt)}`
}

export function templateThumbnailUrl(
  templateId: string,
  updatedAt?: Date | null
) {
  return `/api/v1/templates/${encodePathPart(templateId)}/thumbnail${cacheVersion(updatedAt)}`
}

export function projectRenderThumbnailUrl(
  projectId: string,
  version?: Date | null
) {
  return `/api/v1/projects/${encodePathPart(projectId)}/render-thumbnail${cacheVersion(version)}`
}

export function projectRenderThumbnailVersion(
  renderedAt: Date | null,
  updatedAt: Date
) {
  return renderedAt && renderedAt > updatedAt ? renderedAt : updatedAt
}
