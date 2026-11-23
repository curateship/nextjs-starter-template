import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { defaultMenu } from "../src/lib/menu"
import { menuApi, readMenu } from "./menu-file"

let folder: string
let file: string
let server: Server
let base: string
const origin = "http://localhost:3021"

beforeEach(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "personal-menu-"))
  file = path.join(folder, "data", "menu.json")
  const api = menuApi(file, [origin])
  server = createServer((request, response) => {
    void api(request, response, () => {
      response.statusCode = 404
      response.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(folder, { recursive: true, force: true })
})

function put(body: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/menu`, {
    method: "PUT",
    headers: { origin, "content-type": "application/json", ...headers },
    body,
  })
}

describe("the menu file", () => {
  it("starts with the default menu when nothing is saved", async () => {
    const response = await fetch(`${base}/api/menu`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(defaultMenu())
  })

  it("saves a menu and reads it back", async () => {
    const menu = { ...defaultMenu(), sections: [] }
    expect((await put(JSON.stringify(menu))).status).toBe(200)
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(menu)
    expect(await readMenu(file)).toEqual(menu)
  })

  it("refuses a save from another page, a wrong shape or a bad address", async () => {
    const menu = JSON.stringify(defaultMenu())
    expect((await put(menu, { origin: "http://evil.example" })).status).toBe(403)
    expect((await put(menu, { "content-type": "text/plain" })).status).toBe(415)
    expect((await put("{not json")).status).toBe(400)
    const bad = { ...defaultMenu(), top: [{ id: "a", label: "A", url: "javascript:x", icon: "link" }] }
    expect((await put(JSON.stringify(bad))).status).toBe(400)
    await expect(readFile(file, "utf8")).rejects.toThrow()
  })

  it("says so when the saved file is not a menu", async () => {
    await put(JSON.stringify(defaultMenu()))
    await writeFile(file, '{"version": 2}', "utf8")
    const response = await fetch(`${base}/api/menu`)
    expect(response.status).toBe(500)
    expect((await response.json()).error).toContain("is not a menu Personal can read")
  })

  it("passes other addresses on", async () => {
    expect((await fetch(`${base}/elsewhere`)).status).toBe(404)
  })
})
