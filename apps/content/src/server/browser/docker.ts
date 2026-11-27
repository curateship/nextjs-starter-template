import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import type { RequestOptions } from "node:http"

/**
 * Just enough of the Docker Engine API to start, stop and look at one browser
 * container. Trimmed from `apps/anti-detect/src/server/orchestrator/index.ts`,
 * keeping the two things that matter for safety: a plain-HTTP Docker host must
 * be local, and a reply is capped so a confused daemon cannot exhaust memory.
 *
 * Hand-rolled rather than a package because the whole need is five calls, and
 * the Docker client libraries bring a dependency tree to make them.
 */

/** Docker can hand back a container list of any size; this is where it stops. */
const MAX_RESPONSE_BYTES = 1024 * 1024

const API_VERSION = "v1.43"

export type DockerConnection =
  | { type: "socket"; socketPath: string }
  | {
      type: "http"
      protocol: "http:" | "https:"
      hostname: string
      port?: number
    }

type DockerEnv = Record<string, string | undefined>

/**
 * Where Docker is. The default is this machine's own socket, which is what
 * the Mac uses. The env names are promo's own, so setting anti-detect's does
 * not silently move promo's browsers.
 */
export function dockerConnection(env: DockerEnv = process.env): DockerConnection {
  const socketPath = env.PROMO_DOCKER_SOCKET_PATH
  if (socketPath) return { type: "socket", socketPath }

  const host = env.PROMO_DOCKER_HOST
  if (host) {
    const url = host.includes("://") ? new URL(host) : null
    if (url) {
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("PROMO_DOCKER_HOST must use http or https")
      }
      const connection: DockerConnection = {
        type: "http",
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number.parseInt(url.port, 10) : undefined,
      }
      assertSecureDockerConnection(connection)
      return connection
    }
    const connection: DockerConnection = {
      type: "http",
      protocol: dockerProtocol(env.PROMO_DOCKER_PROTOCOL),
      hostname: host,
      port: env.PROMO_DOCKER_PORT
        ? Number.parseInt(env.PROMO_DOCKER_PORT, 10)
        : undefined,
    }
    assertSecureDockerConnection(connection)
    return connection
  }

  return { type: "socket", socketPath: "/var/run/docker.sock" }
}

function dockerProtocol(raw: string | undefined): "http:" | "https:" {
  if (!raw || raw === "http") return "http:"
  if (raw === "https") return "https:"
  throw new Error("PROMO_DOCKER_PROTOCOL must be http or https")
}

/**
 * Plain HTTP to a Docker daemon is an unauthenticated way to run anything on
 * that machine as root. Over a network that is a hole, so it is refused;
 * locally it is the ordinary setup.
 */
export function assertSecureDockerConnection(connection: DockerConnection) {
  if (
    connection.type === "http" &&
    connection.protocol === "http:" &&
    !isLocalDockerHost(connection.hostname)
  ) {
    throw new Error("PROMO_DOCKER_HOST requires https for a non-local Docker host")
  }
}

function isLocalDockerHost(hostname: string) {
  const normalized = hostname.toLowerCase()
  return (
    normalized === "localhost" ||
    normalized === "host.docker.internal" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  )
}

type DockerMethod = "DELETE" | "GET" | "POST" | "PUT"

export class DockerRequestError extends Error {
  readonly method: DockerMethod
  readonly path: string
  readonly status: number
  readonly responseText: string

  constructor(
    method: DockerMethod,
    path: string,
    status: number,
    responseText: string
  ) {
    super(`Docker API request failed with status ${status}`)
    this.name = "DockerRequestError"
    this.method = method
    this.path = path
    this.status = status
    this.responseText = responseText
  }
}

export class DockerConnectionError extends Error {
  readonly method: DockerMethod
  readonly path: string
  readonly causeMessage: string

  constructor(
    method: DockerMethod,
    path: string,
    causeMessage: string
  ) {
    super("Docker API request could not connect")
    this.name = "DockerConnectionError"
    this.method = method
    this.path = path
    this.causeMessage = causeMessage
  }
}

/**
 * Turns a Docker failure into something safe to put in front of a person.
 *
 * The real status, path and body go to the server log, because they can name
 * an image, a volume or a host path. What comes back is one sentence.
 */
export function publicDockerError(error: unknown, action: string): Error {
  if (
    error instanceof DockerRequestError ||
    error instanceof DockerConnectionError
  ) {
    console.error(`Browser ${action} Docker request failed`, {
      method: error.method,
      path: error.path,
      detail:
        error instanceof DockerRequestError
          ? { status: error.status, responseText: error.responseText }
          : { causeMessage: error.causeMessage },
    })
    return new Error(`The browser could not ${action}. Check the Docker logs.`)
  }
  return error instanceof Error ? error : new Error(String(error))
}

export async function dockerRequest<T = unknown>(
  connection: DockerConnection,
  method: "DELETE" | "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body)
  const headers: Record<string, string> = {}
  if (payload) {
    headers["Content-Type"] = "application/json"
    headers["Content-Length"] = Buffer.byteLength(payload).toString()
  }

  const { options, requestFn } = requestFor(connection, method, path, headers)

  return new Promise<T>((resolve, reject) => {
    const req = requestFn(options, (res) => {
      const chunks: Buffer[] = []
      let bytes = 0
      let tooLarge = false

      res.on("data", (chunk: Buffer) => {
        if (tooLarge) return
        bytes += chunk.length
        if (bytes > MAX_RESPONSE_BYTES) {
          tooLarge = true
          res.destroy()
          reject(
            new DockerConnectionError(
              method,
              path,
              "the Docker reply went past 1 MB"
            )
          )
          return
        }
        chunks.push(chunk)
      })

      res.on("end", () => {
        if (tooLarge) return
        const text = Buffer.concat(chunks).toString("utf8")
        const status = res.statusCode ?? 500
        if (status >= 400) {
          reject(new DockerRequestError(method, path, status, text))
          return
        }
        if (!text) {
          resolve({} as T)
          return
        }
        try {
          resolve(JSON.parse(text) as T)
        } catch {
          resolve({} as T)
        }
      })
    })

    req.on("error", (error: Error) => {
      reject(new DockerConnectionError(method, path, error.message))
    })

    if (payload) req.write(payload)
    req.end()
  })
}

function requestFor(
  connection: DockerConnection,
  method: DockerMethod,
  path: string,
  headers: Record<string, string>
) {
  const options: RequestOptions =
    connection.type === "socket"
      ? { socketPath: connection.socketPath, method, path: `/${API_VERSION}${path}`, headers }
      : {
          protocol: connection.protocol,
          hostname: connection.hostname,
          port: connection.port,
          method,
          path: `/${API_VERSION}${path}`,
          headers,
        }
  const requestFn =
    connection.type === "http" && connection.protocol === "https:" ? httpsRequest : httpRequest
  return { options, requestFn }
}

/**
 * A Docker call whose body or reply is bytes rather than JSON: a folder read
 * out of a container as an archive, or an archive written into one. Held in
 * memory, never on disk, up to `maxBytes`.
 */
export async function dockerBytes(
  connection: DockerConnection,
  method: "GET" | "PUT",
  path: string,
  options: { body?: Buffer; maxBytes: number }
): Promise<Buffer> {
  const headers: Record<string, string> = {}
  if (options.body) {
    headers["Content-Type"] = "application/x-tar"
    headers["Content-Length"] = options.body.length.toString()
  }
  const { options: request, requestFn } = requestFor(connection, method, path, headers)

  return new Promise<Buffer>((resolve, reject) => {
    const req = requestFn(request, (res) => {
      const chunks: Buffer[] = []
      let bytes = 0
      let tooLarge = false
      res.on("data", (chunk: Buffer) => {
        if (tooLarge) return
        bytes += chunk.length
        if (bytes > options.maxBytes) {
          tooLarge = true
          res.destroy()
          reject(new DockerConnectionError(method, path, `the Docker reply went past ${options.maxBytes} bytes`))
          return
        }
        chunks.push(chunk)
      })
      res.on("end", () => {
        if (tooLarge) return
        const data = Buffer.concat(chunks)
        const status = res.statusCode ?? 500
        if (status >= 400) {
          reject(new DockerRequestError(method, path, status, data.toString("utf8").slice(0, 2_000)))
          return
        }
        resolve(data)
      })
    })
    req.on("error", (error: Error) => reject(new DockerConnectionError(method, path, error.message)))
    if (options.body) req.write(options.body)
    req.end()
  })
}

export type ContainerSpec = {
  image: string
  name: string
  env: string[]
  labels: Record<string, string>
  volumeName: string
  /** Published to this address only, never 0.0.0.0. */
  bindHost: string
  commandPort: number
  streamPort: number
  webrtcPort: number
  /** The most memory the container may hold, swap included. */
  memoryBytes: number
  /** Processor share, in billionths of one processor. */
  nanoCpus: number
}

/**
 * The create payload. Three ports are published and nothing else: the command
 * port the app drives through, the stream port a person watches on, and one
 * UDP port for the video itself.
 *
 * `ShmSize` is 2GB because Firefox crashes on the Docker default of 64MB.
 */
export function dockerCreateOptions(spec: ContainerSpec) {
  const exposedPorts: Record<string, Record<string, never>> = {
    "8080/tcp": {},
    [`${spec.commandPort}/tcp`]: {},
    [`${spec.webrtcPort}/udp`]: {},
  }

  const portBindings: Record<
    string,
    Array<{ HostIp: string; HostPort: string }>
  > = {
    "8080/tcp": [{ HostIp: spec.bindHost, HostPort: String(spec.streamPort) }],
    [`${spec.commandPort}/tcp`]: [
      { HostIp: spec.bindHost, HostPort: String(spec.commandPort) },
    ],
    [`${spec.webrtcPort}/udp`]: [
      { HostIp: spec.bindHost, HostPort: String(spec.webrtcPort) },
    ],
  }

  return {
    Image: spec.image,
    name: spec.name,
    Env: spec.env,
    Labels: spec.labels,
    ExposedPorts: exposedPorts,
    HostConfig: {
      Binds: [`${spec.volumeName}:/data/profile`],
      ShmSize: 2 * 1024 * 1024 * 1024,
      PortBindings: portBindings,
      // A ceiling per browser, so one runaway Firefox cannot take the machine.
      // MemorySwap equal to Memory means no swap on top: past the line the
      // container's process is stopped, which the dead-browser check reports.
      Memory: spec.memoryBytes,
      MemorySwap: spec.memoryBytes,
      NanoCpus: spec.nanoCpus,
    },
  }
}
