import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer, get, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { defaultMenu } from "../src/lib/menu"
import { liveServer } from "./live"

const origin = "https://personal.barelycompany.com"
let folder: string
let server: Server
let base: string

beforeEach(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "personal-live-"))
  await mkdir(path.join(folder, "dist", "assets"), { recursive: true })
  await writeFile(path.join(folder, "dist", "index.html"), "<!doctype html><title>Personal</title>")
  await writeFile(path.join(folder, "dist", "assets", "index-abc.js"), "console.log(1)")
  await writeFile(path.join(folder, "dist", "logo.png"), "png")
  await writeFile(path.join(folder, "secret.txt"), "outside dist")
  const handler = liveServer({
    distDir: path.join(folder, "dist"),
    menuFile: path.join(folder, "volume", "menu.json"),
    password: "open sesame",
    origin,
    visitorOf: () => "",
  })
  server = createServer((request, response) => void handler(request, response))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(folder, { recursive: true, force: true })
})

async function signedInCookie() {
  const response = await fetch(`${base}/api/sign-in`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ password: "open sesame" }),
  })
  return (response.headers.get("set-cookie") ?? "").split(";")[0]
}

describe("liveServer", () => {
  it("answers /health with no sign-in", async () => {
    const response = await fetch(`${base}/health`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("ok")
  })

  it("serves the page, never cached, on any screen's address", async () => {
    for (const address of ["/", "/trade.barelycompany.com/admin/trading-overview?tab=1"]) {
      const response = await fetch(`${base}${address}`)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.text()).toContain("<title>Personal</title>")
    }
  })

  it("serves built files, caching only hashed ones", async () => {
    const script = await fetch(`${base}/assets/index-abc.js`)
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
    expect(script.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(await script.text()).toBe("console.log(1)")
    const logo = await fetch(`${base}/logo.png`)
    expect(logo.headers.get("content-type")).toBe("image/png")
    expect(logo.headers.get("cache-control")).toBe("no-cache")
  })

  it("answers 404 for a missing built file instead of the page", async () => {
    expect((await fetch(`${base}/assets/gone.js`)).status).toBe(404)
  })

  it("never serves a file outside the built page", async () => {
    // Sent as typed: fetch would tidy the dots away before they reach the server.
    for (const address of ["/../secret.txt", "/assets/..%2f..%2fsecret.txt", "/%2e%2e/secret.txt"]) {
      const text = await new Promise<string>((resolve, reject) => {
        get(`${base}/`, { path: address }, (response) => {
          let body = ""
          response.on("data", (chunk) => (body += chunk))
          response.on("end", () => resolve(body))
        }).on("error", reject)
      })
      expect(text).not.toContain("outside dist")
    }
  })

  it("refuses to be framed by anyone", async () => {
    for (const address of ["/", "/health", "/api/menu"]) {
      const response = await fetch(`${base}${address}`)
      expect(response.headers.get("x-frame-options")).toBe("DENY")
      expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'")
    }
  })

  it("keeps the menu behind the sign-in and saves it to the volume", async () => {
    expect((await fetch(`${base}/api/menu`)).status).toBe(401)
    const cookie = await signedInCookie()
    expect((await fetch(`${base}/api/menu`, { headers: { cookie } })).status).toBe(200)
    const menu = { ...defaultMenu(), sidebarWidth: 300 }
    const saved = await fetch(`${base}/api/menu`, {
      method: "PUT",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify(menu),
    })
    expect(saved.status).toBe(200)
    const file = JSON.parse(await readFile(path.join(folder, "volume", "menu.json"), "utf8"))
    expect(file.sidebarWidth).toBe(300)
  })

  it("only takes saves from its own live address", async () => {
    const cookie = await signedInCookie()
    const response = await fetch(`${base}/api/menu`, {
      method: "PUT",
      headers: { cookie, origin: "http://localhost:3021", "content-type": "application/json" },
      body: JSON.stringify(defaultMenu()),
    })
    expect(response.status).toBe(403)
  })

  it("refuses other methods on the page", async () => {
    expect((await fetch(`${base}/`, { method: "POST" })).status).toBe(405)
  })
})
