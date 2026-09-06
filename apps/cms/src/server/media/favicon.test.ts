import sharp from "sharp"
import { afterAll, describe, expect, it, vi } from "vitest"

import {
  createFaviconVariant,
  deleteReplacedFaviconFiles,
} from "@/server/media/favicon"

const savedPublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

afterAll(() => {
  if (savedPublicUrl === undefined) {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  } else {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = savedPublicUrl
  }
})

describe("favicon image sets", () => {
  it("creates each PNG size beside one uploaded source", async () => {
    const sourceData = new Uint8Array(
      await sharp({
        create: {
          width: 40,
          height: 20,
          channels: 4,
          background: { r: 30, g: 100, b: 200, alpha: 1 },
        },
      })
        .png()
        .toBuffer()
    )
    const files = new Map<string, Uint8Array>()
    const variant = await createFaviconVariant(
      { storagePath: "owner/source.png" },
      "light",
      {
        createId: () => "version-1",
        read: async () => sourceData,
        write: async (path, data) => {
          files.set(path, data)
        },
        remove: async (path) => {
          files.delete(path)
        },
        publicUrl: (path) => `https://media.example.test/${path}`,
      }
    )

    expect(variant).toEqual({
      source: "https://media.example.test/owner/source.png",
      icon16:
        "https://media.example.test/owner/favicons/version-1/light-16.png",
      icon32:
        "https://media.example.test/owner/favicons/version-1/light-32.png",
      appleTouchIcon:
        "https://media.example.test/owner/favicons/version-1/light-180.png",
      icon512:
        "https://media.example.test/owner/favicons/version-1/light-512.png",
    })

    for (const size of [16, 32, 180, 512]) {
      const data = files.get(`owner/favicons/version-1/light-${size}.png`)
      expect(data).toBeDefined()
      await expect(sharp(data).metadata()).resolves.toMatchObject({
        format: "png",
        width: size,
        height: size,
      })
    }
  })

  it("cleans up completed files when one generated upload fails", async () => {
    const remove = vi.fn(async () => undefined)
    await expect(
      createFaviconVariant(
        { storagePath: "owner/source.png" },
        "dark",
        {
          createId: () => "version-2",
          read: async () => validPng(),
          write: async (path) => {
            if (path.endsWith("-32.png")) throw new Error("Storage failed")
          },
          remove,
          publicUrl: (path) => `https://media.example.test/${path}`,
        }
      )
    ).rejects.toThrow("Storage failed")
    expect(remove).toHaveBeenCalledWith("owner/favicons/version-2/dark-16.png")
    expect(remove).toHaveBeenCalledWith("owner/favicons/version-2/dark-32.png")
  })

  it("deletes only replaced generated files", async () => {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://media.example.test"
    const remove = vi.fn(async () => undefined)
    const oldLight = variant("00000000-0000-4000-8000-000000000002", "light")
    const keptDark = variant("00000000-0000-4000-8000-000000000003", "dark")
    const nextLight = variant("00000000-0000-4000-8000-000000000004", "light")

    await deleteReplacedFaviconFiles(
      { light: oldLight, dark: keptDark },
      { light: nextLight, dark: keptDark },
      remove
    )

    expect(remove).toHaveBeenCalledTimes(4)
    expect(remove.mock.calls.flat()).toEqual([
      "00000000-0000-4000-8000-000000000001/favicons/00000000-0000-4000-8000-000000000002/light-16.png",
      "00000000-0000-4000-8000-000000000001/favicons/00000000-0000-4000-8000-000000000002/light-32.png",
      "00000000-0000-4000-8000-000000000001/favicons/00000000-0000-4000-8000-000000000002/light-180.png",
      "00000000-0000-4000-8000-000000000001/favicons/00000000-0000-4000-8000-000000000002/light-512.png",
    ])
  })
})

async function validPng() {
  return new Uint8Array(
    await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
  )
}

function variant(version: string, mode: "light" | "dark") {
  const owner = "00000000-0000-4000-8000-000000000001"
  const root = `https://media.example.test/${owner}/favicons/${version}/${mode}`
  return {
    source: `https://media.example.test/${owner}/${mode}.png`,
    icon16: `${root}-16.png`,
    icon32: `${root}-32.png`,
    appleTouchIcon: `${root}-180.png`,
    icon512: `${root}-512.png`,
  }
}
