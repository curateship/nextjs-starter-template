import { AnimatedGroup } from './animated-group'
import type { AnimationSettings } from '@/lib/actions/sites/site-actions'

interface BlockContainerProps {
  children: React.ReactNode
  className?: string
  container?: boolean
  id?: string
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
  header,
  animated = true,
  animationPreset,
  customAnimationSettings,
}: BlockContainerProps) {
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
      <div className={container ? "mx-auto max-w-6xl px-6" : ""}>
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