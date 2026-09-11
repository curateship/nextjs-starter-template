import sharp from "sharp"

import {
  FAVICON_IMAGE_FIELDS,
  isGeneratedFaviconStoragePath,
  normalizePublicFaviconSet,
  type PublicFaviconSet,
  type PublicFaviconVariant,
} from "@/lib/favicon"
import { uuid } from "@/server/auth/security"
import {
  deleteFromR2,
  getFromR2,
  getPublicMediaUrl,
  uploadToR2,
} from "@/server/media/storage"
import { storagePathForUrl } from "@/server/media/library"
import { toDarkBrandImage } from "@/server/media/brand-image"

type FaviconSource = {
  storagePath: string
}

type FaviconStorage = {
  createId: () => string
  read: (storagePath: string) => Promise<Uint8Array>
  write: (
    storagePath: string,
    data: Uint8Array,
    contentType?: string
  ) => Promise<void>
  remove: (storagePath: string) => Promise<void>
  publicUrl: (storagePath: string) => string
}

const defaultStorage: FaviconStorage = {
  createId: uuid,
  read: async (storagePath) => {
    const object = await getFromR2(storagePath)
    if (!object.Body) throw new Error("The favicon file is empty")
    return new Uint8Array(await object.Body.transformToByteArray())
  },
  write: (storagePath, data, contentType = "image/png") =>
    uploadToR2(storagePath, data, contentType),
  remove: deleteFromR2,
  publicUrl: getPublicMediaUrl,
}

/** Makes one immutable PNG set from an image already owned by the admin. */
export async function createFaviconVariant(
  source: FaviconSource,
  mode: "light" | "dark",
  storage: FaviconStorage = defaultStorage
): Promise<PublicFaviconVariant> {
  const sourceData = await storage.read(source.storagePath)
  const versionPath = newVersionPath(source.storagePath, storage)
  const uploadedPaths: string[] = []

  try {
    const images = await writeFaviconSizes({
      versionPath,
      mode,
      sourceData,
      storage,
      uploadedPaths,
    })
    return { source: storage.publicUrl(source.storagePath), ...images }
  } catch (error) {
    await Promise.allSettled(uploadedPaths.map((path) => storage.remove(path)))
    throw error
  }
}

/**
 * The whole dark side of one uploaded brand image: its dark-mode twin, plus the
 * browser-tab sizes cut from that twin.
 *
 * The twin is a generated file rather than a second upload, so it is written
 * into the same version folder as the sizes. `isGeneratedFaviconStoragePath`
 * covers that folder, which is what lets one replacement sweep remove all five
 * files and what keeps the orphan tool from offering them up for deletion.
 *
 * The returned `source` is the twin's address. The settings save stores it as
 * both the dark logo and the dark favicon, so the two are the same picture and
 * cannot drift apart.
 */
export async function createDarkBrandVariant(
  source: FaviconSource & { mimeType: string },
  storage: FaviconStorage = defaultStorage
): Promise<PublicFaviconVariant> {
  const uploaded = await storage.read(source.storagePath)
  const dark = await toDarkBrandImage(uploaded, source.mimeType)
  const versionPath = newVersionPath(source.storagePath, storage)
  const darkSourcePath = `${versionPath}/dark-source.${dark.extension}`
  const uploadedPaths: string[] = [darkSourcePath]

  try {
    await storage.write(darkSourcePath, dark.data, dark.contentType)
    const images = await writeFaviconSizes({
      versionPath,
      mode: "dark",
      sourceData: dark.data,
      storage,
      uploadedPaths,
    })
    return { source: storage.publicUrl(darkSourcePath), ...images }
  } catch (error) {
    await Promise.allSettled(uploadedPaths.map((path) => storage.remove(path)))
    throw error
  }
}

function newVersionPath(storagePath: string, storage: FaviconStorage) {
  const ownerPath = storagePath.split("/")[0]
  if (!ownerPath) throw new Error("The favicon file has no owner")
  return `${ownerPath}/favicons/${storage.createId()}`
}

async function writeFaviconSizes({
  versionPath,
  mode,
  sourceData,
  storage,
  uploadedPaths,
}: {
  versionPath: string
  mode: "light" | "dark"
  sourceData: Uint8Array
  storage: FaviconStorage
  uploadedPaths: string[]
}) {
  const images: Partial<PublicFaviconVariant> = {}
  for (const { key, size } of FAVICON_IMAGE_FIELDS) {
    const storagePath = `${versionPath}/${mode}-${size}.png`
    const data = await resizeFavicon(sourceData, size)
    // Include the path before the request. A storage timeout can happen after
    // R2 accepted the bytes, so cleanup must try the uncertain path too.
    uploadedPaths.push(storagePath)
    await storage.write(storagePath, data, "image/png")
    images[key] = storage.publicUrl(storagePath)
  }

  return {
    icon16: images.icon16!,
    icon32: images.icon32!,
    appleTouchIcon: images.appleTouchIcon!,
    icon512: images.icon512!,
  }
}

/** Removes generated files that the replacement set no longer uses. */
export async function deleteReplacedFaviconFiles(
  previousValue: unknown,
  nextValue: unknown,
  remove: (storagePath: string) => Promise<void> = deleteFromR2
) {
  const previous = normalizePublicFaviconSet(previousValue)
  if (!previous) return

  const nextUrls = new Set(
    faviconFileUrls(normalizePublicFaviconSet(nextValue))
  )
  const oldPaths = faviconFileUrls(previous)
    .filter((url) => !nextUrls.has(url))
    .map(storagePathForUrl)
    .filter((path): path is string =>
      Boolean(path && isGeneratedFaviconStoragePath(path))
    )

  await Promise.all(oldPaths.map((path) => remove(path)))
}

async function resizeFavicon(data: Uint8Array, size: number) {
  return new Uint8Array(
    await sharp(data, {
      failOn: "error",
      limitInputPixels: 25_000_000,
    })
      .rotate()
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
  )
}

function faviconFileUrls(set: PublicFaviconSet | null) {
  return [set?.light, set?.dark].flatMap((variant) =>
    variant
      ? // `source` is here because the dark variant's source is generated too.
        // The light variant's source is the admin's own media file, and the
        // `isGeneratedFaviconStoragePath` filter in the caller is what keeps
        // this sweep from deleting it out of their library.
        [variant.source, ...FAVICON_IMAGE_FIELDS.map(({ key }) => variant[key])]
      : []
  )
}
