import { ViewAllButton } from "@/components/ui/view-all-button";

interface FrontendBlockContainerProps {
  children: React.ReactNode
  className?: string
  container?: boolean
  header?: {
    title?: string
    subtitle?: string
    align?: 'left' | 'center' | 'right'
  }
  viewAllButton?: {
    text?: string
    href?: string
  }
}

export function FrontendBlockContainer({ 
  children, 
  className = "",
  container = true,
  header,
  viewAllButton
}: FrontendBlockContainerProps) {
  return (
    <section className={`py-16 md:py-18 ${className}`}>
      <div className={container ? "mx-auto max-w-6xl px-6" : ""}>
        {(header || viewAllButton) && (
          <div className="mb-12">
            {header && (
              <div className={`${header.align === 'left' ? 'text-left' : header.align === 'right' ? 'text-right' : 'text-center'} ${viewAllButton ? 'flex justify-between items-start' : ''}`}>
                <div className={viewAllButton ? 'flex-1' : ''}>
                  {header.title && (
                    <h2 className="text-3xl font-bold md:text-5xl">{header.title}</h2>
                  )}
                  {header.subtitle && (
                    <p className="mt-4 text-lg text-muted-foreground">{header.subtitle}</p>
                  )}
                </div>
                {viewAllButton && (
                  <div className="flex-shrink-0 ml-8">
                    <ViewAllButton 
                      text={viewAllButton.text} 
                      href={viewAllButton.href}
                      className="mt-0"
                    />
                  </div>
                )}
              </div>
            )}
            {!header && viewAllButton && (
              <div className="flex justify-end">
                <ViewAllButton 
                  text={viewAllButton.text} 
                  href={viewAllButton.href}
                  className="mt-0"
                />
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  )
} 