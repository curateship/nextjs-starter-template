import { AsyncLocalStorage } from "node:async_hooks"

import { getRequest, getRequestHeaders } from "@tanstack/react-start/server"

const requestStorage = new AsyncLocalStorage<Request>()

export function runWithRequestContext<T>(
  request: Request,
  callback: () => T
) {
  return requestStorage.run(request, callback)
}

export async function headers() {
  return requestStorage.getStore()?.headers ?? getRequestHeaders()
}

export async function request() {
  return requestStorage.getStore() ?? getRequest()
}
