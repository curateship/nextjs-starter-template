import type { LookupAddress } from "node:dns"

import { describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  fetchPage,
  isRefusedAddress,
  previewPage,
  readPreview,
  safeLookup,
  visitableAddress,
  type GetPage,
  type PageAnswer,
} from "@/server/project/page-preview"

const page = (body: string): PageAnswer => ({ status: 200, location: null, contentType: "text/html; charset=utf-8", body })
const redirect = (location: string): PageAnswer => ({ status: 302, location, contentType: "text/html", body: "" })

describe("which addresses Project's server may visit", () => {
  it("refuses private, local and cloud-metadata addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.9",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "::ffff:7f00:1",
      "::7f00:1",
      "::a00:1",
      "2002:7f00:1::1",
      "64:ff9b:1::a00:1",
      "fec0::1",
      "not an address",
    ]) {
      expect(isRefusedAddress(address), address).toBe(true)
    }
    for (const address of ["8.8.8.8", "172.32.0.1", "142.250.80.46", "2607:f8b0:4004:c07::64"]) {
      expect(isRefusedAddress(address), address).toBe(false)
    }
  })

  it("takes only https on the usual port, with no name or password and no private host", () => {
    expect(visitableAddress("https://docs.google.com/document/d/1")?.hostname).toBe("docs.google.com")
    for (const text of [
      "http://example.com",
      "https://localhost/",
      "https://intranet/",
      "https://printer.local/",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
      "https://127.0.0.1/",
      "https://[::1]/",
      "https://[::127.0.0.1]/",
      "https://localhost./",
      "https://printer.local./",
      "https://metadata.google.internal./",
      "https://192.168.0.1/admin",
      "javascript:alert(1)",
    ]) {
      expect(visitableAddress(text), text).toBeNull()
    }
  })

  it("refuses a name that points at a private address, when the connection looks it up", async () => {
    const answers: Record<string, LookupAddress[]> = {
      "sneaky.example": [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
      "fine.example": [{ address: "93.184.216.34", family: 4 }],
    }
    const resolve = ((host: string, _options: unknown, done: (error: null, addresses: LookupAddress[]) => void) =>
      done(null, answers[host] ?? [])) as unknown as Parameters<typeof safeLookup>[0]
    const lookup = safeLookup(resolve)
    const ask = (host: string) =>
      new Promise<{ error: Error | null; address: unknown }>((done) =>
        (lookup as unknown as (h: string, o: object, cb: (e: Error | null, a: unknown) => void) => void)(host, {}, (error, address) =>
          done({ error, address })
        )
      )
    expect((await ask("sneaky.example")).error?.message).toBe(PROJECT_ERRORS.pageAddressRefused)
    expect(await ask("fine.example")).toEqual({ error: null, address: "93.184.216.34" })
  })
})

describe("following a page's redirects", () => {
  it("follows up to three, and refuses one that leads somewhere private", async () => {
    const hops: string[] = []
    const get: GetPage = async (url) => {
      hops.push(url.toString())
      if (url.pathname === "/a") return redirect("/b")
      if (url.pathname === "/b") return redirect("https://other.example/c")
      return page("<title>Landed</title>")
    }
    const { url } = await fetchPage(new URL("https://start.example/a"), get)
    expect(url.toString()).toBe("https://other.example/c")
    expect(hops).toHaveLength(3)

    const toPrivate: GetPage = async () => redirect("https://169.254.169.254/latest/meta-data")
    await expect(fetchPage(new URL("https://start.example/"), toPrivate)).rejects.toThrow(PROJECT_ERRORS.pageAddressRefused)

    const toHttp: GetPage = async () => redirect("http://start.example/")
    await expect(fetchPage(new URL("https://start.example/"), toHttp)).rejects.toThrow(PROJECT_ERRORS.pageAddressRefused)

    const forever: GetPage = async (url) => redirect(`/${url.pathname.length}`)
    await expect(fetchPage(new URL("https://start.example/"), forever)).rejects.toThrow(PROJECT_ERRORS.pageAddressRefused)
  })
})

describe("what the card shows", () => {
  it("reads the title, site name, picture and icon from the top of the page", () => {
    const preview = readPreview(
      `<html><head>
        <title>Fallback &amp; more</title>
        <meta property="og:title" content="Q4 plan &#8211; draft">
        <meta property="og:site_name" content="Google Docs">
        <meta property="og:image" content="/thumb.png">
        <link rel="icon" href="https://ssl.gstatic.com/docs/icon.ico">
      </head></html>`,
      new URL("https://docs.google.com/document/d/1")
    )
    expect(preview).toEqual({
      url: "https://docs.google.com/document/d/1",
      title: "Q4 plan – draft",
      siteName: "Google Docs",
      imageUrl: "https://docs.google.com/thumb.png",
      iconUrl: "https://ssl.gstatic.com/docs/icon.ico",
    })
  })

  it("keeps only https pictures, and falls back to the address's host", () => {
    const preview = readPreview(
      `<meta property="og:image" content="http://insecure.example/a.png"><link rel="icon" href="javascript:alert(1)">`,
      new URL("https://www.example.com/page")
    )
    expect(preview).toMatchObject({ title: null, siteName: "example.com", imageUrl: null, iconUrl: null })
  })

  it("still gives a card with the site's name when the page is slow or has no title", async () => {
    const slow: GetPage = () => Promise.reject(new Error("timeout"))
    expect(await previewPage("https://slow.example/report", { get: slow })).toEqual({
      url: "https://slow.example/report",
      title: null,
      siteName: "slow.example",
      imageUrl: null,
      iconUrl: null,
    })
    const bare: GetPage = async () => page("<p>No head at all</p>")
    expect((await previewPage("https://bare.example/", { get: bare })).title).toBeNull()
  })

  it("refuses in words an address it won't visit", async () => {
    const never: GetPage = () => {
      throw new Error("should not be called")
    }
    await expect(previewPage("https://localhost/", { get: never })).rejects.toThrow(PROJECT_ERRORS.pageAddressRefused)
    await expect(previewPage("http://192.168.0.1", { get: never })).rejects.toThrow(PROJECT_ERRORS.pageAddressRefused)
  })
})
