import sharp from "sharp"

/**
 * A carousel as a PDF, one slide to a page, which is how LinkedIn takes a
 * carousel post (workspace/docs/carousel-exports.md). Each page is the slide's
 * picture and nothing else, at one point per pixel, so a 4:5 slide is a page
 * 1080 by 1350 points.
 *
 * The file is written here by hand rather than with a library: a PDF of
 * whole-page pictures needs only a page list, and each page's JPEG goes in as
 * it is, so the file is small and written in one pass.
 */

const JPEG_QUALITY = 90

/** A slide's PNG as a JPEG on a white background, for a PDF page. */
export async function slidePageJpeg(png: Uint8Array) {
  const { data, info } = await sharp(png)
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true })
  return { bytes: new Uint8Array(data), width: info.width, height: info.height }
}

/** Every page in order. Each page is as big as its picture. */
export function createSlidesPdf(
  pages: { bytes: Uint8Array; width: number; height: number }[]
) {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part
    parts.push(bytes)
    length += bytes.byteLength
  }
  const object = (id: number, body: () => void) => {
    offsets[id] = length
    push(`${id} 0 obj\n`)
    body()
    push("\nendobj\n")
  }

  // Object 1 is the catalogue and 2 the page list; each page then takes three:
  // the page, what it draws, and its picture.
  const pageIds = pages.map((_, index) => 3 + index * 3)
  push("%PDF-1.4\n%âãÏÓ\n")
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"))
  object(2, () =>
    push(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`
    )
  )
  pages.forEach((page, index) => {
    const pageId = pageIds[index]
    const drawing = `q ${page.width} 0 0 ${page.height} 0 0 cm /Slide Do Q`
    object(pageId, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Slide ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`
      )
    )
    object(pageId + 1, () =>
      push(`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`)
    )
    object(pageId + 2, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.byteLength} >>\nstream\n`
      )
      push(page.bytes)
      push("\nendstream")
    })
  })

  const size = 3 + pages.length * 3
  const xref = length
  push(`xref\n0 ${size}\n0000000000 65535 f \n`)
  for (let id = 1; id < size; id += 1) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`)
  }
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const pdf = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    pdf.set(part, at)
    at += part.byteLength
  }
  return pdf
}

/** Where a kept carousel's PDF sits, beside its ZIP. */
export function carouselPdfPath(zipStoragePath: string) {
  return zipStoragePath.replace(/\.zip$/, ".pdf")
}
