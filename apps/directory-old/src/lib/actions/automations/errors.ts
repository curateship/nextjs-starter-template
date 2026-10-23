export class RetryableAutomationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryableAutomationError'
  }
}

export function isRetryableAutomationError(error: unknown): error is RetryableAutomationError {
  return error instanceof RetryableAutomationError
}
