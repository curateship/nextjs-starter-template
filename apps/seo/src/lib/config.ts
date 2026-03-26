function requireEnv(name: 'VITE_SEO_API_URL' | 'VITE_HUB_APP_URL') {
  const value = import.meta.env[name]

  if (value) {
    return value
  }

  if (import.meta.env.DEV) {
    if (name === 'VITE_SEO_API_URL') {
      return 'http://localhost:8000'
    }

    return 'http://localhost:3000'
  }

  throw new Error(`${name} is not configured`)
}

export const config = {
  seoApiUrl: requireEnv('VITE_SEO_API_URL'),
  hubAppUrl: requireEnv('VITE_HUB_APP_URL'),
}
