/**
 * Safe logging utility that only logs in development mode
 * Prevents information disclosure in production
 */

const isDevelopment = process.env.NODE_ENV === 'development'

export const logger = {
  info: (message: string, data?: any) => {
    if (isDevelopment) {
      console.log(message, data)
    }
  },
  
  error: (message: string, error?: any) => {
    if (isDevelopment) {
      console.error(message, error)
    }
    // In production, you might want to send to an error tracking service
    // Example: Sentry.captureException(error)
  },
  
  warn: (message: string, data?: any) => {
    if (isDevelopment) {
      console.warn(message, data)
    }
  },
  
  debug: (message: string, data?: any) => {
    if (isDevelopment) {
      console.debug(message, data)
    }
  }
}

// claude.md followed