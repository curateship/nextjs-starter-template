import {
  notFound as createNotFound,
  redirect as createRedirect,
} from "@tanstack/react-router"

export function redirect(href: string): never {
  throw createRedirect({ to: href })
}

export function notFound(): never {
  throw createNotFound()
}
