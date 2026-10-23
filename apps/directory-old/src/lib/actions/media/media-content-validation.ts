import sanitizeHtml from 'sanitize-html'

function sanitizeSvgBuffer(fileBuffer: Buffer) {
  let source = ''
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(fileBuffer)
  } catch {
    throw new Error('File content does not match the selected media type.')
  }

  const allowedAttributes = [
    'xmlns',
    'xmlns:xlink',
    'version',
    'viewBox',
    'width',
    'height',
    'id',
    'class',
    'role',
    'aria-label',
    'aria-labelledby',
    'href',
    'xlink:href',
    'fill',
    'fill-rule',
    'fill-opacity',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-opacity',
    'd',
    'x',
    'y',
    'xlink:x',
    'xlink:y',
    'x1',
    'x2',
    'y1',
    'y2',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'points',
    'opacity',
    'transform',
    'offset',
    'stop-color',
    'stop-opacity',
    'gradientUnits',
    'gradientTransform',
    'clipPathUnits',
    'maskUnits',
    'maskContentUnits',
    'patternUnits',
    'patternContentUnits',
    'preserveAspectRatio',
    'vector-effect',
  ]
  const sanitized = sanitizeHtml(source, {
    allowedTags: [
      'svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
      'title', 'desc', 'linearGradient', 'radialGradient', 'stop', 'clipPath',
      'mask', 'pattern', 'symbol', 'use',
    ],
    allowedAttributes: { '*': allowedAttributes },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    parser: {
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
    },
  }).trim()

  const hasUnsafeReference =
    /(?:javascript:|data:|@import|expression\s*\(|-moz-binding)/i.test(sanitized) ||
    /url\s*\(\s*(?!['"]?#)[^)]+\)/i.test(sanitized) ||
    /\s(?:href|xlink:href)\s*=\s*(['"])(?!#)[\s\S]*?\1/i.test(sanitized)

  if (!/^<svg(?:\s|>)/i.test(sanitized) || hasUnsafeReference) {
    throw new Error('File content does not match the selected media type.')
  }

  return Buffer.from(sanitized, 'utf8')
}

export function prepareMediaBuffer(mimeType: string, fileBuffer: Buffer) {
  if (mimeType === 'image/svg+xml') return sanitizeSvgBuffer(fileBuffer)
  validateMediaContent(mimeType, fileBuffer)
  return fileBuffer
}

function validateMediaContent(mimeType: string, data: Buffer) {
  const valid =
    ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && hasPrefix(data, [0xff, 0xd8, 0xff])) ||
    (mimeType === 'image/png' && hasPrefix(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (mimeType === 'image/gif' && (hasAscii(data, 0, 'GIF87a') || hasAscii(data, 0, 'GIF89a'))) ||
    (mimeType === 'image/webp' && hasAscii(data, 0, 'RIFF') && hasAscii(data, 8, 'WEBP')) ||
    ((mimeType === 'video/mp4' || mimeType === 'video/quicktime') && hasAscii(data, 4, 'ftyp')) ||
    (mimeType === 'video/webm' && hasPrefix(data, [0x1a, 0x45, 0xdf, 0xa3])) ||
    (mimeType === 'video/x-msvideo' && hasAscii(data, 0, 'RIFF') && hasAscii(data, 8, 'AVI ')) ||
    (mimeType === 'video/x-matroska' && hasPrefix(data, [0x1a, 0x45, 0xdf, 0xa3]))

  if (!valid) {
    throw new Error('File content does not match the selected media type.')
  }
}

function hasPrefix(data: Buffer, prefix: number[]) {
  return prefix.every((byte, index) => data[index] === byte)
}

function hasAscii(data: Buffer, offset: number, value: string) {
  if (data.length < offset + value.length) return false
  return Array.from(value).every((character, index) => data[offset + index] === character.charCodeAt(0))
}

export function defaultExtensionForMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/svg+xml') return 'svg'
  if (mimeType === 'video/mp4') return 'mp4'
  if (mimeType === 'video/webm') return 'webm'
  if (mimeType === 'video/quicktime') return 'mov'
  if (mimeType === 'video/x-msvideo') return 'avi'
  if (mimeType === 'video/x-matroska') return 'mkv'
  return 'bin'
}
