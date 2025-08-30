"use client"

import { BlockContainer } from "@/components/ui/block-container"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useState } from "react"

interface Hotspot {
  id: string
  x: number
  y: number
  text: string
}

interface ProductHotspotBlockProps {
  title?: string
  subtitle?: string
  headerAlign?: 'left' | 'center'
  backgroundImage?: string
  hotspots?: Hotspot[]
  showTooltipsAlways?: boolean
  className?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

const ProductHotspotBlock = ({
  title = "Interactive Product Overview",
  subtitle = "Hover over the blinking dots to discover more about our features",
  headerAlign = "center",
  backgroundImage = "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-1.svg",
  hotspots = [],
  showTooltipsAlways = false,
  className = "white",
  siteWidth = 'custom',
  customWidth
}: ProductHotspotBlockProps) => {
  const [imageLoaded, setImageLoaded] = useState(false)

  return (
    <BlockContainer
      id="product-hotspot"
      className={className}
      siteWidth={siteWidth}
      customWidth={customWidth}
      header={{
        title,
        subtitle,
        align: headerAlign
      }}
    >
      <div className="flex flex-col items-center">
        <div className="relative mt-8 w-full">
          {backgroundImage && (
            <img
              src={backgroundImage}
              alt={title}
              className="w-full rounded-lg border shadow-lg transition-opacity duration-300"
              style={{
                objectFit: "contain",
                opacity: imageLoaded ? 1 : 0.8
              }}
              onLoad={() => setImageLoaded(true)}
            />
          )}
          
          {/* Hotspots */}
          {hotspots.map((hotspot) => (
            showTooltipsAlways ? (
              <div key={hotspot.id} className="absolute z-10" style={{
                left: `${hotspot.x}%`,
                top: `${hotspot.y}%`,
                transform: 'translate(-50%, -50%)'
              }}>
                <button
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition-transform hover:scale-110 focus:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  style={{
                    animation: 'hotspot-blink 2s infinite'
                  }}
                  aria-label={`Hotspot: ${hotspot.text}`}
                >
                  <div className="h-2 w-2 rounded-full bg-white" />
                </button>
                <div className="absolute mt-2 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-sm rounded-md px-3 py-2 shadow-lg max-w-md w-64 z-20">
                  <div>{hotspot.text}</div>
                </div>
              </div>
            ) : (
              <Tooltip key={hotspot.id}>
                <TooltipTrigger asChild>
                  <button
                    className="absolute z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition-transform hover:scale-110 focus:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    style={{
                      left: `${hotspot.x}%`,
                      top: `${hotspot.y}%`,
                      transform: 'translate(-50%, -50%)',
                      animation: 'hotspot-blink 2s infinite'
                    }}
                    aria-label={`Hotspot: ${hotspot.text}`}
                  >
                    <div className="h-2 w-2 rounded-full bg-white" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md w-64">
                  <div className="text-sm">{hotspot.text}</div>
                </TooltipContent>
              </Tooltip>
            )
          ))}
        </div>
      </div>
      
      <style jsx>{`
        @keyframes hotspot-blink {
          0%, 70% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
          }
          85% {
            opacity: 0.8;
            box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
          }
          100% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
          }
        }
      `}</style>
    </BlockContainer>
  )
}

export { ProductHotspotBlock }
export type { Hotspot, ProductHotspotBlockProps } 