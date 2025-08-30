import { AnimatedGroup } from './animated-group'
import type { AnimationSettings } from '@/lib/actions/sites/site-actions'

interface BlockContainerProps {
  children: React.ReactNode
  className?: string
  container?: boolean
  id?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
  header?: {
    title?: string
    subtitle?: string
    align?: 'left' | 'center' | 'right'
  }
  // Animation props
  animated?: boolean
  animationPreset?: 'fade' | 'slide' | 'scale' | 'blur' | 'blur-slide' | 'zoom' | 'flip' | 'bounce' | 'rotate' | 'swing'
  customAnimationSettings?: Partial<AnimationSettings>
}

export function BlockContainer({ 
  children, 
  className = "",
  container = true,
  id,
  siteWidth = 'custom',
  customWidth,
  header,
  animated = true,
  animationPreset,
  customAnimationSettings,
}: BlockContainerProps) {
  // Handle width - either full width or custom pixel value
  const effectiveCustomWidth = customWidth || 1152
  const containerStyle = siteWidth === 'custom' 
    ? { maxWidth: `${effectiveCustomWidth}px` }
    : undefined
  
  const containerClass = siteWidth === 'full' ? '' : ''
  const content = (
    <>
      {header && (
        <div className={`mb-12 ${header.align === 'left' ? 'text-left' : header.align === 'right' ? 'text-right' : 'text-center'}`}>
          {header.title && (
            <h2 className={`text-3xl font-bold md:text-5xl max-w-3xl ${header.align === 'center' || !header.align ? 'mx-auto' : ''}`}>
              {header.title}
            </h2>
          )}
          {header.subtitle && (
            <p className={`mt-4 text-lg text-muted-foreground max-w-3xl ${header.align === 'center' || !header.align ? 'mx-auto' : ''}`}>
              {header.subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </>
  );

  return (
    <section id={id} className={`py-16 md:py-16 ${className}`}>
      <div 
        className={container ? `mx-auto ${containerClass} px-6` : ""} 
        style={containerStyle}
      >
        {animated ? (
          <AnimatedGroup
            preset={animationPreset}
            customSettings={customAnimationSettings}
            useIntersectionObserver={true}
          >
            {content}
          </AnimatedGroup>
        ) : (
          content
        )}
      </div>
    </section>
  )
} 