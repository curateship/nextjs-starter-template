'use client'

import { useEffect } from 'react'

interface HeaderScriptsProps {
  scripts?: string
}

export function HeaderScripts({ scripts }: HeaderScriptsProps) {
  useEffect(() => {
    if (!scripts) return

    // Create a temporary container to parse the HTML
    const container = document.createElement('div')
    container.innerHTML = scripts

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

      // Append to head
      document.head.appendChild(newScript)
    })

    // Cleanup function to remove scripts when component unmounts
    return () => {
      const addedScripts = document.head.querySelectorAll('script[src*="googletagmanager"], script[src*="google-analytics"]')
      addedScripts.forEach(script => script.remove())
    }
  }, [scripts])

  return null
}
