"use client";

import { Button } from "@/components/ui/button";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { GradientOverlays } from "@/components/ui/gradient-overlays";
import DotPattern from "@/components/ui/dot-pattern";
import Image from "next/image";
import { AnimatedGroup } from "@/components/ui/animated-group";

// Background Pattern component that supports different pattern types
const BackgroundPattern = ({ 
  pattern, 
  size, 
  opacity, 
  color 
}: { 
  pattern?: string; 
  size?: string; 
  opacity?: number; 
  color?: string; 
}) => {
  if (pattern === 'none') return null;
  
  const getPatternSize = (size?: string) => {
    switch (size) {
      case 'small': return { width: 12, height: 12 };
      case 'large': return { width: 24, height: 24 };
      default: return { width: 16, height: 16 }; // medium
    }
  };

  const getPatternOpacity = (opacity?: number) => {
    return opacity ? opacity / 100 : 0.8;
  };

  const patternSize = getPatternSize(size);
  const patternOpacity = getPatternOpacity(opacity);
  const patternColor = color || '#94a3b8';

  if (pattern === 'grid') {
    return (
      <svg
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full",
          "[mask-image:radial-gradient(60vw_circle_at_center,white,transparent)]"
        )}
        style={{ opacity: patternOpacity }}
      >
        <defs>
          <pattern
            id="grid-pattern"
            width={patternSize.width}
            height={patternSize.height}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${patternSize.width} 0 L 0 0 0 ${patternSize.height}`}
              fill="none"
              stroke={patternColor}
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
      </svg>
    );
  }

  // Default to dot pattern
  return (
    <DotPattern 
      className={cn(
        "[mask-image:radial-gradient(60vw_circle_at_center,white,transparent)]"
      )}
      {...patternSize}
      style={{ 
        opacity: patternOpacity,
        fill: patternColor
      }}
    />
  );
};
import { cn } from "@/lib/utils/tailwind-class-merger";
import Link from "next/link";
import { TrustedByAvatars } from "@/components/ui/trusted-by-avatars";

interface ProductHeroBlockProps {
  className?: string;
  title?: string;
  subtitle?: string;
  primaryButton?: string;
  secondaryButton?: string;
  primaryButtonLink?: string;
  secondaryButtonLink?: string;
  rainbowButtonText?: string;
  rainbowButtonIcon?: string;
  rainbowButtonLink?: string;
  trustedByText?: string;
  trustedByCount?: string;
  trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }>;
  backgroundPattern?: string;
  backgroundPatternSize?: string;
  backgroundPatternOpacity?: number;
  heroImage?: string;
}

// Main hero content component
const HeroContent = ({
  title,
  subtitle,
  primaryButton,
  secondaryButton,
  primaryButtonLink,
  secondaryButtonLink,
  rainbowButtonText,
  rainbowButtonIcon,
  rainbowButtonLink,
  trustedByText,
  trustedByCount,
  trustedByAvatars
}: Pick<ProductHeroBlockProps, 'title' | 'subtitle' | 'primaryButton' | 'secondaryButton' | 'primaryButtonLink' | 'secondaryButtonLink' | 'rainbowButtonText' | 'rainbowButtonIcon' | 'rainbowButtonLink' | 'trustedByText' | 'trustedByCount' | 'trustedByAvatars'>) => (
  <div className="relative z-10 text-center max-w-3xl space-y-6">
    {rainbowButtonText && rainbowButtonText.trim() && (
      <RainbowButton
        href={rainbowButtonLink || "#"}
        icon={rainbowButtonIcon as any}
        target="_blank"
        rel="noopener noreferrer"
      >
        {rainbowButtonText}
      </RainbowButton>
    )}
    <HeroTitle title={title} />
    <HeroSubtitle subtitle={subtitle} />
    <CTAButtons primaryButton={primaryButton} secondaryButton={secondaryButton} primaryButtonLink={primaryButtonLink} secondaryButtonLink={secondaryButtonLink} />
    {trustedByAvatars && trustedByAvatars.length > 0 && <SocialProof trustedByText={trustedByText} trustedByCount={trustedByCount} trustedByAvatars={trustedByAvatars} />}
  </div>
)

const ProductHeroBlock = ({ 
  className, 
  title, 
  subtitle, 
  primaryButton, 
  secondaryButton,
  primaryButtonLink,
  secondaryButtonLink,
  rainbowButtonText,
  rainbowButtonIcon,
  rainbowButtonLink, 
  trustedByText,
  trustedByCount,
  trustedByAvatars,
  backgroundPattern,
  backgroundPatternSize,
  backgroundPatternOpacity,
  heroImage
}: ProductHeroBlockProps) => {
  return (
    <section id="hero" className="relative w-full flex flex-col items-center justify-center px-6 pt-12 pb-4 md:pb-10 overflow-hidden">
      {/* Background layer with pattern and gradient overlays */}
      <div className="absolute inset-0 z-0">
        {/* Background pattern */}
        <BackgroundPattern 
          pattern={backgroundPattern || 'dots'}
          size={backgroundPatternSize || 'medium'}
          opacity={backgroundPatternOpacity || 80}
        />
        
        {/* Gradient overlays that only affect the background pattern */}
        <GradientOverlays />
      </div>
      
      {/* Content layer above background */}
      <div className="relative z-10 w-full flex flex-col items-center">
        <AnimatedGroup customSettings={{ stagger: 0.2 }}>
          <HeroContent 
          title={title}
          subtitle={subtitle}
          primaryButton={primaryButton}
          secondaryButton={secondaryButton}
          primaryButtonLink={primaryButtonLink}
          secondaryButtonLink={secondaryButtonLink}
          rainbowButtonText={rainbowButtonText}
          rainbowButtonIcon={rainbowButtonIcon}
          rainbowButtonLink={rainbowButtonLink}
          trustedByText={trustedByText}
          trustedByCount={trustedByCount}
          trustedByAvatars={trustedByAvatars}
          />
        </AnimatedGroup>
        <HeroImage heroImage={heroImage} />
      </div>
    </section>
  );
};


// Hero title component (animation handled by AnimatedGroup)
const HeroTitle = ({ title }: { title?: string }) => {
  if (!title || !title.trim()) return null
  
  return (
    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold py-2 md:py-5 leading-none tracking-tight">
      {title}
    </h1>
  )
}

// Hero subtitle component (animation handled by AnimatedGroup)
const HeroSubtitle = ({ subtitle }: { subtitle?: string }) => {
  if (!subtitle || !subtitle.trim()) return null
  
  return (
    <p className="text-lg text-muted-foreground max-w-xl mx-auto">
      {subtitle}
    </p>
  )
}

// Call-to-action buttons component (animation handled by AnimatedGroup)
const CTAButtons = ({ primaryButton, secondaryButton, primaryButtonLink, secondaryButtonLink }: { primaryButton?: string; secondaryButton?: string; primaryButtonLink?: string; secondaryButtonLink?: string }) => {
  const hasPrimaryButton = primaryButton && primaryButton.trim()
  const hasSecondaryButton = secondaryButton && secondaryButton.trim()
  
  // Don't render if no buttons have content
  if (!hasPrimaryButton && !hasSecondaryButton) return null

  // Enhanced scroll function with offset and strict target validation
  const scrollToTarget = (targetId: string) => {
    const targetElement = document.querySelector(targetId)
    if (!targetElement) {
      return // Do nothing if target not found
    }
    
    // Get scroll offset to account for any fixed navigation
    const scrollOffset = 80 // Adjust this value as needed
    const elementTop = targetElement.getBoundingClientRect().top + window.pageYOffset
    const offsetPosition = elementTop - scrollOffset
    
    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    })
  }

  const handlePrimaryClick = () => {
    // If link provided and starts with #, treat as scroll target
    if (primaryButtonLink && primaryButtonLink.startsWith('#')) {
      const targetElement = document.querySelector(primaryButtonLink)
      if (targetElement) {
        scrollToTarget(primaryButtonLink)
      }
    }
    // If no scroll target specified, do nothing (no scroll)
  }

  const handleSecondaryClick = () => {
    // If link provided and starts with #, treat as scroll target
    if (secondaryButtonLink && secondaryButtonLink.startsWith('#')) {
      const targetElement = document.querySelector(secondaryButtonLink)
      if (targetElement) {
        scrollToTarget(secondaryButtonLink)
      }
    }
    // If no scroll target specified, do nothing (no scroll)
  }

  return (
    <div className="mt-8 flex justify-center gap-4 flex-wrap">
      {hasPrimaryButton && (
        primaryButtonLink && !primaryButtonLink.startsWith('#') ? (
          <Link href={primaryButtonLink}>
            <Button size="lg">{primaryButton}</Button>
          </Link>
        ) : (
          <Button size="lg" onClick={handlePrimaryClick}>
            {primaryButton}
          </Button>
        )
      )}
      {hasSecondaryButton && (
        secondaryButtonLink && !secondaryButtonLink.startsWith('#') ? (
          <Link href={secondaryButtonLink}>
            <Button size="lg" variant="outline">
              {secondaryButton}
            </Button>
          </Link>
        ) : (
          <Button size="lg" variant="outline" onClick={handleSecondaryClick}>
            {secondaryButton}
          </Button>
        )
      )}
    </div>
  )
}

// Social proof section component (animation handled by AnimatedGroup)
const SocialProof = ({ trustedByText, trustedByCount, trustedByAvatars }: { trustedByText?: string; trustedByCount?: string; trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }> }) => (
  <div className="mt-8 flex justify-center">
    <TrustedByAvatars badgeText={trustedByText} avatars={trustedByAvatars} />
  </div>
)

// Hero Image component (animation handled by global system)
const HeroImage = ({ heroImage }: { heroImage?: string }) => {
  if (!heroImage) return null;
  
  return (
    <div className="w-full max-w-[1100px] mx-auto">
      <AnimatedGroup customSettings={{ stagger: 0.05, duration: 1.2 }}>
        <div className="overflow-hidden sm:mt-8 pb-4 md:pb-8">
          <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background overflow-hidden rounded-2xl border shadow-lg shadow-zinc-950/15">
            <Image
              className="bg-background rounded-2xl w-full h-auto"
              src={heroImage}
              alt="app screen"
              width={1608}
              height={1002}
              priority
            />
          </div>
        </div>
      </AnimatedGroup>
    </div>
  );
}

export { ProductHeroBlock };