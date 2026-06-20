import type { DirectoryState } from "@/app/types"

export function fileName(path: string) {
  return path.split("/").pop() || "Untitled"
}

export function parentPath(path: string) {
  return path.split("/").slice(0, -1).join("/")
}

export function joinRelativePath(basePath: string, childPath: string) {
  if (!basePath) return childPath
  if (!childPath) return basePath
  return `${basePath}/${childPath}`.replace(/\/+/g, "/")
}

export function isSameOrChildPath(path: string, parent: string) {
  return path === parent || path.startsWith(`${parent}/`)
}

export function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  if (path === oldPrefix) return newPrefix
  return `${newPrefix}${path.slice(oldPrefix.length)}`
}

export function removeDirectoryPrefix(
  directories: Record<string, DirectoryState>,
  path: string
) {
  return Object.fromEntries(
    Object.entries(directories).filter(([key]) => !isSameOrChildPath(key, path))
  )
}

export function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
