"use client"

import { toast } from "sonner"

import type { AdminActionResult } from "@/lib/actions/action-result"

type LegacyActionResult = {
  error?: string | null
  success?: boolean
}

type ActionRunResult<TResult> =
  | { ok: true; result: TResult }
  | { ok: false; message: string; result?: TResult }

function getFailureMessage(result: AdminActionResult<unknown> | LegacyActionResult, fallback: string) {
  if ("ok" in result) return result.ok ? null : result.message
  if (result.error) return result.error
  return result.success === false ? fallback : null
}

export function showActionError(message: string) {
  toast.error(message, { duration: Infinity })
}

export function showActionSuccess(message: string) {
  toast.success(message, { duration: 3500 })
}

export async function runAction<TResult extends AdminActionResult<unknown> | LegacyActionResult>(
  action: () => Promise<TResult>,
  {
    errorMessage = "Something went wrong — the error has been logged.",
    successMessage,
  }: {
    errorMessage?: string
    successMessage?: string
  } = {},
): Promise<ActionRunResult<TResult>> {
  try {
    const result = await action()
    const message = getFailureMessage(result, errorMessage)
    if (message) {
      showActionError(message)
      return { ok: false, message, result }
    }

    if (successMessage) showActionSuccess(successMessage)
    return { ok: true, result }
  } catch {
    showActionError(errorMessage)
    return { ok: false, message: errorMessage }
  }
}
