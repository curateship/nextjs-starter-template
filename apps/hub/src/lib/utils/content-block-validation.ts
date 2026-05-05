const DEFAULT_MAX_CONTENT_BLOCKS_BYTES = 50_000

export function validateContentBlocks(
  contentBlocks: unknown,
  maxBytes = DEFAULT_MAX_CONTENT_BLOCKS_BYTES
) {
  if (typeof contentBlocks !== 'object' || contentBlocks === null || Array.isArray(contentBlocks)) {
    return 'Invalid content blocks format'
  }

  let serialized = ''
  try {
    serialized = JSON.stringify(contentBlocks)
  } catch {
    return 'Invalid content blocks format'
  }

  if (serialized.length > maxBytes) {
    return 'Content blocks too large'
  }

  return null
}
