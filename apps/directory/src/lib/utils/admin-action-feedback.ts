"use client"

import { toast } from "sonner"

import type { AdminActionResult } from "@/lib/actions/action-result"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

type ActionRunResult<TResult> =
  | { ok: true; result: TResult }
  | { ok: false; message: string; result?: TResult }

function getFailureMessage(result: AdminActionResult<unknown>) {
  return result.ok ? null : result.message
}

export function showActionError(message: string) {
  showErrorToast(message)
}

export function showActionSuccess(message: string) {
  // No duration here: the Toaster's own duration is the saved setting
  // (Platform Settings → Toast message duration).
  toast.success(message)
}

export async function runAction<TResult extends AdminActionResult<unknown>>(
  action: () => Promise<TResult>,
  {
    errorMessage = "Something went wrong — the error has been logged.",
    successMessage,
  }: {
    errorMessage?: string
    successMessage?: string
  } = {},
): Promise<ActionRunResult<TResult>> {
  dismissErrorToast()
  try {
    const result = await action()
    const message = getFailureMessage(result)
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
