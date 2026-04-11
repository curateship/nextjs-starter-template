"use client"

import { BlockContainer } from "@/components/frontend/layout/block-container"
import { useEffect, useRef, useState } from "react"

interface EmbeddedBlockProps {
  content: {
    code?: string
    type?: 'html' | 'script'
    visibility?: Record<string, boolean>
  }
  className?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function EmbeddedBlock({ content, className = "", siteWidth = 'custom', customWidth }: EmbeddedBlockProps) {
  const { code = '', type = 'html' } = content
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMounted, setIsMounted] = useState(false)

  // Only render after mount to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (code && containerRef.current && isMounted) {
      try {
        containerRef.current.innerHTML = ''

        // Parse embed HTML off-DOM so scripts can be controlled before anything renders.
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = code

        const scripts = tempDiv.querySelectorAll('script')
        const externalScripts: HTMLScriptElement[] = []
        const inlineScripts: HTMLScriptElement[] = []

        scripts.forEach((script) => {
          if (script.src) {
            externalScripts.push(script)
          } else {
            inlineScripts.push(script)
          }
        })

        // Render markup first, then load external scripts and finally run inline scripts.
        const nonScriptContent = Array.from(tempDiv.childNodes).filter(
          node => node.nodeName !== 'SCRIPT'
        )
        nonScriptContent.forEach(node => {
          try {
            containerRef.current?.appendChild(node.cloneNode(true))
          } catch (error) {
            // Ignore invalid embedded markup without breaking the page.
          }
        })

        const executeScripts = async () => {
          // Keep external script order stable because inline snippets often depend on them.
          for (const oldScript of externalScripts) {
            await new Promise<void>((resolve) => {
              try {
                const newScript = document.createElement('script')

                Array.from(oldScript.attributes).forEach(attr => {
                  newScript.setAttribute(attr.name, attr.value)
                })

                newScript.onload = () => resolve()
                newScript.onerror = (error) => {
                  resolve() // Continue even if one script fails
                }

                containerRef.current?.appendChild(newScript)
              } catch (error) {
                resolve()
              }
            })
          }

          // Non-JS script tags, such as JSON-LD, should be preserved instead of evaluated.
          setTimeout(() => {
            inlineScripts.forEach((oldScript) => {
              try {
                const scriptType = oldScript.type.trim().toLowerCase()
                const executableTypes = ['', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript']

                if (!executableTypes.includes(scriptType)) {
                  containerRef.current?.appendChild(oldScript.cloneNode(true))
                  return
                }

                if (oldScript.textContent) {
                  try {
                    new Function(oldScript.textContent).call(window)
                  } catch (error) {
                    // Ignore failed embedded scripts so third-party snippets cannot crash rendering.
                  }
                }
              } catch (error) {
                // Ignore invalid embedded scripts without breaking the page.
              }
            })
          }, 100)
        }

        executeScripts()

      } catch (error) {
        // Ignore invalid embed code without breaking the page.
      }
    }
  }, [code, type, isMounted])

  if (!code || code.trim() === '' || content.visibility?.embed === false) {
    return null
  }

  // Always use ref approach to handle scripts properly
  return (
    <BlockContainer
      className={className}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div ref={containerRef} style={!isMounted ? { minHeight: '100px' } : undefined} />
    </BlockContainer>
  )
}
