import React from "react";

/**
 * GradientOverlays component
 *
 * Provides gradient overlays on all four edges to blend background patterns
 * smoothly into the page background. Useful for hero sections and pattern backgrounds.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <BackgroundPattern />
 *   <GradientOverlays />
 *   <Content />
 * </div>
 * ```
 */
export function GradientOverlays() {
  return (
    <>
      {/* Top gradient overlay */}
      <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--background)_/_0.6),transparent)] pointer-events-none" />

      {/* Bottom gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(to_top,hsl(var(--background)),hsl(var(--background)_/_0.6),transparent)] pointer-events-none" />

      {/* Left edge gradient */}
      <div className="absolute inset-y-0 left-0 w-8 bg-[linear-gradient(to_right,hsl(var(--background)),transparent)] pointer-events-none" />

      {/* Right edge gradient */}
      <div className="absolute inset-y-0 right-0 w-8 bg-[linear-gradient(to_left,hsl(var(--background)),transparent)] pointer-events-none" />
    </>
  );
}
