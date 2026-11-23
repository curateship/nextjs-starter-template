// Detect media type from a URL's file extension (used by features blocks and media inputs)
export const getMediaType = (url: string): 'image' | 'video' | 'unknown' => {
  if (!url) return 'unknown'
  const ext = url.split('.').pop()?.toLowerCase()
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv']
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']

  if (videoExts.includes(ext || '')) return 'video'
  if (imageExts.includes(ext || '')) return 'image'
  return 'unknown'
}
