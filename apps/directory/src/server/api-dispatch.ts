import { toNextRequest } from "@/lib/web-response"

type ApiContext = { params: Promise<Record<string, string | string[]>> }
type ApiHandler = (request: Request, context: ApiContext) => Response | Promise<Response>
type ApiModule = Partial<Record<string, ApiHandler>>
type ApiLoader = () => Promise<ApiModule>

type ApiRoute = {
  keys: Array<{ name: string; catchAll: boolean }>
  load: ApiLoader
  pattern: RegExp
  score: number
}

const apiModules = import.meta.glob<ApiModule>("./api/**/route.ts")

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildApiRoute(modulePath: string, load: ApiLoader): ApiRoute {
  const relativePath = modulePath
    .replace(/^\.\/api\//, "")
    .replace(/\/route\.ts$/, "")
  const segments = relativePath.split("/")
  const keys: ApiRoute["keys"] = []
  let score = segments.length

  const pattern = segments
    .map((segment) => {
      const catchAll = segment.match(/^\[\.\.\.(.+)\]$/)
      if (catchAll) {
        keys.push({ name: catchAll[1], catchAll: true })
        return "(.+)"
      }

      const dynamic = segment.match(/^\[(.+)\]$/)
      if (dynamic) {
        keys.push({ name: dynamic[1], catchAll: false })
        score += 10
        return "([^/]+)"
      }

      score += 100
      return escapePattern(segment)
    })
    .join("/")

  return {
    keys,
    load,
    pattern: new RegExp(`^/api/${pattern}$`),
    score,
  }
}

const apiRoutes = Object.entries(apiModules)
  .map(([path, load]) => buildApiRoute(path, load))
  .sort((left, right) => right.score - left.score)

export async function dispatchApi(request: Request) {
  const pathname = new URL(request.url).pathname

  for (const route of apiRoutes) {
    const match = pathname.match(route.pattern)
    if (!match) continue

    const params: Record<string, string | string[]> = {}
    try {
      route.keys.forEach((key, index) => {
        const value = decodeURIComponent(match[index + 1] || "")
        params[key.name] = key.catchAll ? value.split("/") : value
      })
    } catch {
      return Response.json({ error: "Invalid API route" }, { status: 400 })
    }

    const module = await route.load()
    const handler = module[request.method]
    if (!handler) {
      return Response.json({ error: "Method not allowed" }, { status: 405 })
    }

    return handler(toNextRequest(request), { params: Promise.resolve(params) })
  }

  return Response.json({ error: "API route not found" }, { status: 404 })
}
