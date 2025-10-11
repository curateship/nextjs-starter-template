"use client"

import { BlockContainer } from '@/components/frontend/layout/block-container'
import { useState, useRef } from 'react'
import { Play } from 'lucide-react'
import Image from 'next/image'

interface ProductVideoBlockProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: 'left' | 'center' | 'right'
    videoUrl: string
    coverImage?: string
    autoplay?: boolean
    loop?: boolean
    muted?: boolean
  }
  className?: string
  siteWidth?: 'narrow' | 'standard' | 'wide' | 'full' | 'custom'
  customWidth?: number
}

export function ProductVideoBlock({
  content,
  className = "",
  siteWidth = 'custom',
  customWidth
}: ProductVideoBlockProps) {
  const {
    title = '',
    subtitle = '',
    headerAlign = 'left',
    videoUrl = '',
    coverImage = '',
    autoplay = false,
    loop = false,
    muted = false
  } = content

  const [isPlaying, setIsPlaying] = useState(autoplay)
  const videoRef = useRef<HTMLVideoElement>(null)

  // If no video URL is provided, don't render the block
  if (!videoUrl) {
    return null
  }

  // Get proxied URLs for video and cover image
  const proxiedVideoUrl = `/api/media/proxy?url=${encodeURIComponent(videoUrl)}`
  const proxiedCoverImage = coverImage ? `/api/media/proxy?url=${encodeURIComponent(coverImage)}` : undefined

  const handlePlayClick = () => {
    if (videoRef.current) {
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  return (
    <BlockContainer
      header={{
        title: title,
        subtitle: subtitle,
        align: headerAlign || 'left'
      }}
      className={className}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          controls={isPlaying}
          poster={autoplay ? proxiedCoverImage : undefined}
          autoPlay={autoplay}
          loop={loop}
          muted={muted}
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
          <source src={proxiedVideoUrl} type="video/mp4" />
          <source src={proxiedVideoUrl} type="video/webm" />
          <source src={proxiedVideoUrl} type="video/ogg" />
          Your browser does not support the video tag.
        </video>

        {/* Show cover image with play button overlay when not autoplaying and not playing */}
        {!autoplay && !isPlaying && proxiedCoverImage && (
          <div
            className="absolute inset-0 cursor-pointer group"
            onClick={handlePlayClick}
          >
            <Image
              src={proxiedCoverImage}
              alt={title || 'Video cover'}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
              <div className="w-20 h-20 rounded-full bg-white/90 group-hover:bg-white flex items-center justify-center shadow-lg transition-all group-hover:scale-110">
                <Play className="w-10 h-10 text-black ml-1" fill="currentColor" />
              </div>
            </div>
          </div>
        )}
      </div>
    </BlockContainer>
  )
}
