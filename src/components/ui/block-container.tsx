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
}

export function BlockContainer({ 
  children, 
  className = "",
  container = true,
  id,
  header
}: BlockContainerProps) {
  return (
    <section id={id} className={`py-16 md:py-23 ${className}`}>
      <div className={container ? "mx-auto max-w-6xl px-6" : ""}>
        {header && (
          <div className={`mb-12 ${header.align === 'left' ? 'text-left' : header.align === 'right' ? 'text-right' : 'text-center'}`}>
            {header.title && (
              <h2 className="text-3xl font-bold md:text-5xl max-w-3xl mx-auto">{header.title}</h2>
            )}
            {header.subtitle && (
              <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">
                {header.subtitle}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  )
} 