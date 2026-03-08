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
    // Handle both HTML and script type embedding
    if (code && containerRef.current && isMounted) {
      try {
        // Check if this is Flodesk code
        const isFlodeskCode = code.includes('window.fd(') || code.includes('fd-form-')

        // If it's Flodesk code, ensure the universal script is loaded
        const loadFlodeskScript = () => {
          return new Promise<void>((resolve) => {
            // Check if Flodesk script is already loaded
            if (typeof window !== 'undefined' && (window as any).fd) {
              resolve()
              return
            }

            // Check if script is already being loaded
            const existingScript = document.querySelector('script[src*="flodesk.com/universal"]')
            if (existingScript) {
              // Wait for it to load
              const checkLoaded = setInterval(() => {
                if ((window as any).fd) {
                  clearInterval(checkLoaded)
                  resolve()
                }
              }, 100)
              return
            }

            // Load the Flodesk universal script
            (function(w: any, d: Document, t: string, h: string, s: string, n: string) {
              w.FlodeskObject = n;
              var fn = function() {
                (w[n].q = w[n].q || []).push(arguments);
              };
              w[n] = w[n] || fn;
              var f = d.getElementsByTagName(t)[0];
              var v = '?v=' + Math.floor(new Date().getTime() / (120 * 1000)) * 60;
              var sm = d.createElement(t) as HTMLScriptElement;
              sm.async = true;
              sm.type = 'module';
              sm.src = h + s + '.mjs' + v;
              sm.onload = () => {
                setTimeout(() => resolve(), 200)
              };
              f.parentNode!.insertBefore(sm, f);
              var sn = d.createElement(t) as HTMLScriptElement;
              sn.async = true;
              sn.setAttribute('noModule', '');
              sn.src = h + s + '.js' + v;
              f.parentNode!.insertBefore(sn, f);
            })(window, document, 'script', 'https://assets.flodesk.com', '/universal', 'fd');
          })
        }

        // Clear previous content
        containerRef.current.innerHTML = ''

        // Create a temporary div to parse the HTML
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = code

        // Find all script tags
        const scripts = tempDiv.querySelectorAll('script')

        // Separate external scripts and inline scripts
        const externalScripts: HTMLScriptElement[] = []
        const inlineScripts: HTMLScriptElement[] = []

        scripts.forEach((script) => {
          if (script.src) {
            externalScripts.push(script)
          } else {
            inlineScripts.push(script)
          }
        })

        // First, append any non-script content
        const nonScriptContent = Array.from(tempDiv.childNodes).filter(
          node => node.nodeName !== 'SCRIPT'
        )
        nonScriptContent.forEach(node => {
          try {
            containerRef.current?.appendChild(node.cloneNode(true))
          } catch (error) {
            console.error('Error appending non-script content:', error)
          }
        })

        // Main execution flow
        const executeScripts = async () => {
          // If this is Flodesk code, load Flodesk first
          if (isFlodeskCode) {
            await loadFlodeskScript()
          }

          // Load external scripts first (in sequence)
          for (const oldScript of externalScripts) {
            await new Promise<void>((resolve) => {
              try {
                const newScript = document.createElement('script')

                // Copy attributes
                Array.from(oldScript.attributes).forEach(attr => {
                  newScript.setAttribute(attr.name, attr.value)
                })

                newScript.onload = () => resolve()
                newScript.onerror = (error) => {
                  console.error('Error loading external script:', error)
                  resolve() // Continue even if one script fails
                }

                // Append to container
                containerRef.current?.appendChild(newScript)
              } catch (error) {
                console.error('Error processing external script:', error)
                resolve()
              }
            })
          }

          // Execute inline scripts after external scripts are loaded
          setTimeout(() => {
            inlineScripts.forEach((oldScript) => {
              try {
                const newScript = document.createElement('script')

                // Copy attributes
                Array.from(oldScript.attributes).forEach(attr => {
                  newScript.setAttribute(attr.name, attr.value)
                })

                // Copy script content
                if (oldScript.textContent) {
                  newScript.textContent = oldScript.textContent
                }

                // Add error handling
                newScript.onerror = (error) => {
                  console.error('Error loading inline script:', error)
                }

                // Append to container
                containerRef.current?.appendChild(newScript)
              } catch (error) {
                console.error('Error processing inline script:', error)
              }
            })
          }, 100)
        }

        executeScripts()

      } catch (error) {
        console.error('Error embedding script content:', error)
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
