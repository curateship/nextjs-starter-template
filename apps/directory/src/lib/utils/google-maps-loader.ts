// Singleton loader for the Google Maps JavaScript API (client-side only).
// Loads the script once per page regardless of how many map blocks render.

let loaderPromise: Promise<typeof google> | null = null
let loadedKey: string | null = null

export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser'))
  }

  // The API only supports one key per page; reuse the first successful load.
  if (loaderPromise && loadedKey === apiKey) return loaderPromise
  if (loaderPromise) return loaderPromise

  loadedKey = apiKey
  loaderPromise = new Promise<typeof google>((resolve, reject) => {
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      callback: '__directoryGoogleMapsReady',
    })

    const globalWindow = window as typeof window & { __directoryGoogleMapsReady?: () => void }
    globalWindow.__directoryGoogleMapsReady = () => {
      delete globalWindow.__directoryGoogleMapsReady
      resolve(window.google)
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => {
      loaderPromise = null
      loadedKey = null
      reject(new Error('Failed to load Google Maps'))
    }
    document.head.appendChild(script)
  })

  return loaderPromise
}
