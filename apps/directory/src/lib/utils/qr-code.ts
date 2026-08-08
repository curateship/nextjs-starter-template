// Turning a short string into a QR code, in the two forms this app needs:
// inline SVG for a web page, and a PNG for an email (mail clients do not render
// SVG, so the confirmation email points at the PNG endpoint instead).
//
// `uqr` does the encoding — Reed-Solomon error correction, version and mask
// selection — and hands back a plain matrix of dark/light modules. Everything
// below is just drawing that matrix.

import { deflateSync } from 'node:zlib'
import { encode } from 'uqr'

/** Error correction level M: ~15% of the code can be obscured and still scan. */
const ECC = 'M'
/** The mandatory four-module quiet zone; without it many scanners refuse to read. */
const BORDER = 4

function qrMatrix(text: string) {
  return encode(text, { ecc: ECC, border: BORDER })
}

/**
 * The SVG below is injected with dangerouslySetInnerHTML, so the one caller-
 * supplied string in it is escaped rather than stripped. Quotes matter as much
 * as angle brackets: an unescaped one closes the attribute it sits in.
 */
function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * A square SVG of the code, sized by CSS rather than pixels so it stays crisp.
 * Drawn as one path of 1×1 squares on a white background — the light modules
 * must be light even in dark mode, or nothing can scan it.
 */
export function qrCodeSvg(text: string, options: { title: string }): string {
  const qr = qrMatrix(text)
  const squares: string[] = []

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.data[y][x]) squares.push(`M${x} ${y}h1v1h-1z`)
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" role="img" aria-label="${escapeAttribute(options.title)}" shape-rendering="crispEdges">`,
    `<rect width="${qr.size}" height="${qr.size}" fill="#ffffff"/>`,
    `<path d="${squares.join('')}" fill="#000000"/>`,
    '</svg>',
  ].join('')
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length, 0)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(typed), 0)
  return Buffer.concat([length, typed, checksum])
}

/**
 * A black-and-white PNG of the code, `scale` device pixels per module.
 *
 * Written by hand as a 1-bit greyscale image: a QR is two colours, so the whole
 * file lands in well under a kilobyte and needs no image library. Each row is a
 * filter byte (0 = none) followed by one bit per pixel, 1 = white.
 */
export function qrCodePng(text: string, scale = 8): Buffer {
  const qr = qrMatrix(text)
  const side = qr.size * scale
  const rowBytes = Math.ceil(side / 8)
  const raw = Buffer.alloc((rowBytes + 1) * side)

  for (let y = 0; y < side; y++) {
    const modules = qr.data[Math.floor(y / scale)]
    const offset = y * (rowBytes + 1)
    for (let x = 0; x < side; x++) {
      if (!modules[Math.floor(x / scale)]) raw[offset + 1 + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(side, 0)
  header.writeUInt32BE(side, 4)
  header[8] = 1 // bit depth
  header[9] = 0 // colour type: greyscale

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}
