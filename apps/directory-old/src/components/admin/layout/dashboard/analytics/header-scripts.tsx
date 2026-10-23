'use client'

import { useEffect } from 'react'

interface HeaderScriptsProps {
  scripts?: string
}

export function HeaderScripts({ scripts }: HeaderScriptsProps) {
  useEffect(() => {
    if (!scripts) return

    function injectScripts() {
      // Create a temporary container to parse the HTML
      const container = document.createElement('div')
      container.innerHTML = scripts!

      // Find all script tags
      const scriptTags = container.querySelectorAll('script')

      scriptTags.forEach((oldScript) => {
        // Create a new script element
        const newScript = document.createElement('script')

        // Copy all attributes
        Array.from(oldScript.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value)
        })

        // Copy inline script content
        if (oldScript.textContent) {
          newScript.textContent = oldScript.textContent
        }

        newScript.setAttribute('data-header-script', '')
        document.head.appendChild(newScript)
      })
    }

    // Defer script injection until the browser is idle
    const id = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback(injectScripts)
      : setTimeout(injectScripts, 2000) as unknown as number

    // Cleanup function to remove scripts when component unmounts
    return () => {
      if (typeof requestIdleCallback !== 'undefined') {
        cancelIdleCallback(id)
      } else {
        clearTimeout(id)
      }
      const addedScripts = document.head.querySelectorAll('script[data-header-script]')
      addedScripts.forEach(script => script.remove())
    }
  }, [scripts])

  return null
}
