export type AdminActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string }

export function actionSuccess<T>(data: T): AdminActionResult<T> {
  return { ok: true, data }
}

export function actionFailure(message: string): AdminActionResult<never> {
  return { ok: false, message }
}
