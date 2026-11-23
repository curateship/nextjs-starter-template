export type NextRequest = Request & { nextUrl: URL }

export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers)
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    return new NextResponse(JSON.stringify(data), { ...init, headers })
  }

  static redirect(url: string | URL, init?: number | ResponseInit) {
    const status = typeof init === "number" ? init : init?.status || 307
    const headers = new Headers(typeof init === "number" ? undefined : init?.headers)
    headers.set("Location", url.toString())
    return new NextResponse(null, { status, headers })
  }
}

export function toNextRequest(request: Request): NextRequest {
  return Object.assign(request, { nextUrl: new URL(request.url) })
}
