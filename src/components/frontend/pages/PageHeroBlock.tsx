"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Key, ArrowRight, Download, ExternalLink, Star, Rocket, Github, Zap } from "lucide-react";
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
  const patternColor = color || '#a3a3a3';

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

interface PageHeroBlockProps {
  className?: string;
  title?: string;
  subtitle?: string;
  primaryButton?: string;
  secondaryButton?: string;
  primaryButtonLink?: string;
  secondaryButtonLink?: string;
  backgroundColor?: string;
  rainbowButtonText?: string;
  rainbowButtonIcon?: string;
  githubLink?: string;
  trustedByText?: string;
  trustedByTextColor?: string;
  trustedByCount?: string;
  trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }>;
  backgroundPattern?: string;
  backgroundPatternSize?: string;
  backgroundPatternOpacity?: number;
  backgroundPatternColor?: string;
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
  githubLink,
  trustedByText,
  trustedByTextColor,
  trustedByCount,
  trustedByAvatars,
  backgroundColor
}: Pick<PageHeroBlockProps, 'title' | 'subtitle' | 'primaryButton' | 'secondaryButton' | 'primaryButtonLink' | 'secondaryButtonLink' | 'rainbowButtonText' | 'rainbowButtonIcon' | 'githubLink' | 'trustedByText' | 'trustedByTextColor' | 'trustedByCount' | 'trustedByAvatars' | 'backgroundColor'>) => (
  <div className="relative z-10 text-center max-w-3xl space-y-6">
    {rainbowButtonText && <RainbowButton githubLink={githubLink} buttonText={rainbowButtonText} buttonIcon={rainbowButtonIcon} />}
    <HeroTitle title={title} />
    <HeroSubtitle subtitle={subtitle} />
    <CTAButtons primaryButton={primaryButton} secondaryButton={secondaryButton} primaryButtonLink={primaryButtonLink} secondaryButtonLink={secondaryButtonLink} />
    {trustedByAvatars && trustedByAvatars.length > 0 && <SocialProof trustedByText={trustedByText} trustedByTextColor={trustedByTextColor} trustedByCount={trustedByCount} trustedByAvatars={trustedByAvatars} backgroundColor={backgroundColor} />}
  </div>
)

const PageHeroBlock = ({ 
  title, 
  subtitle, 
  primaryButton, 
  secondaryButton,
  primaryButtonLink,
  secondaryButtonLink,
  backgroundColor = '#ffffff',
  rainbowButtonText,
  rainbowButtonIcon,
  githubLink, 
  trustedByText,
  trustedByTextColor,
  trustedByCount,
  trustedByAvatars,
  backgroundPattern,
  backgroundPatternSize,
  backgroundPatternOpacity,
  backgroundPatternColor,
  heroImage
}: PageHeroBlockProps) => {
  return (
    <section className="relative w-full flex flex-col items-center justify-center px-6 pt-12 pb-10 overflow-hidden">
      {/* Background layer with pattern and gradient overlays */}
      <div className="absolute inset-0 z-0">
        {/* Background pattern */}
        <BackgroundPattern 
          pattern={backgroundPattern || 'dots'}
          size={backgroundPatternSize || 'medium'}
          opacity={backgroundPatternOpacity || 80}
          color={backgroundPatternColor || '#a3a3a3'}
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
            githubLink={githubLink}
            trustedByText={trustedByText}
            trustedByTextColor={trustedByTextColor}
            trustedByCount={trustedByCount}
            trustedByAvatars={trustedByAvatars}
            backgroundColor={backgroundColor}
          />
        </AnimatedGroup>
        <HeroImage heroImage={heroImage} />
      </div>
    </section>
  );
};

// Gradient overlay component for blending background pattern into page background
const GradientOverlays = () => (
  <>
    {/* Top gradient overlay - blends background pattern into page background */}
    <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-background via-background/80 via-background/40 to-transparent pointer-events-none" />
    
    {/* Bottom gradient overlay - blends background pattern into page background */}
    <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-background via-background/80 via-background/40 to-transparent pointer-events-none" />
    
    {/* Left edge gradient for horizontal blending */}
    <div className="absolute top-0 left-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none" />
    
    {/* Right edge gradient for horizontal blending */}
    <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
  </>
)

// Rainbow gradient button component
const RainbowButton = ({ githubLink, buttonText, buttonIcon }: { githubLink?: string; buttonText?: string; buttonIcon?: string }) => (
  <button
    className="group relative inline-flex h-11 cursor-pointer items-center justify-center rounded-3xl border-0 bg-[length:200%] px-8 py-2 font-medium text-black dark:text-white transition-colors [background-clip:padding-box,border-box,border-box] [background-origin:border-box] [border:calc(0.08*1rem)_solid_transparent]
      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50
      before:absolute before:bottom-[-20%] before:left-1/2 before:z-0 before:h-1/5 before:w-3/5 before:-translate-x-1/2 before:animate-[rainbow_3s_linear_infinite] before:bg-[linear-gradient(90deg,var(--color-1),var(--color-2),var(--color-3),var(--color-4),var(--color-5))] before:bg-[length:200%] before:[filter:blur(12px)]
      bg-white dark:bg-black"
    style={{
      // CSS custom properties for rainbow gradient colors
      ['--color-1' as any]: 'hsl(210, 100%, 60%)', // Blue
      ['--color-2' as any]: 'hsl(280, 80%, 65%)',  // Purple
      ['--color-3' as any]: 'hsl(330, 100%, 65%)', // Pink
      ['--color-4' as any]: 'hsl(20, 100%, 60%)',  // Orange
      ['--color-5' as any]: 'hsl(140, 70%, 50%)',  // Green
    }}
  >
    <Link
      href={githubLink || "https://github.com/ruixenui/ruixen-free-components"}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex border px-3 py-2 rounded-2xl items-center text-black dark:text-white font-medium"
    >
      {getButtonIcon(buttonIcon)}
      {buttonText || "Get Access to Everything"}
    </Link>
  </button>
)

// Helper function to get icon component based on string value
const getButtonIcon = (iconName?: string) => {
  const iconClass = "w-4 h-4 mr-2"
  
  switch (iconName) {
    case 'github':
      return <Github className={iconClass} />
    case 'arrow-right':
      return <ArrowRight className={iconClass} />
    case 'download':
      return <Download className={iconClass} />
    case 'external-link':
      return <ExternalLink className={iconClass} />
    case 'star':
      return <Star className={iconClass} />
    case 'rocket':
      return <Rocket className={iconClass} />
    case 'zap':
      return <Zap className={iconClass} />
    case 'none':
      return null
    default:
      return <Key className={iconClass} />
  }
}

// Hero title component (animation handled by AnimatedGroup)
const HeroTitle = ({ title }: { title?: string }) => {
  if (!title || !title.trim()) return null
  
  return (
    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold py-5 leading-none tracking-tight">
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

// Call-to-action buttons component with animation
const CTAButtons = ({ primaryButton, secondaryButton, primaryButtonLink, secondaryButtonLink }: { primaryButton?: string | any; secondaryButton?: string | any; primaryButtonLink?: string; secondaryButtonLink?: string }) => {
  // Handle legacy button objects with {url, text} structure
  const getPrimaryButtonText = () => {
    if (typeof primaryButton === 'string') return primaryButton;
    if (typeof primaryButton === 'object' && primaryButton?.text) return primaryButton.text;
    return "Get Started";
  };

  const getSecondaryButtonText = () => {
    if (typeof secondaryButton === 'string') return secondaryButton;
    if (typeof secondaryButton === 'object' && secondaryButton?.text) return secondaryButton.text;
    return "Browse Components";
  };

  const getPrimaryButtonLink = () => {
    if (primaryButtonLink) return primaryButtonLink;
    if (typeof primaryButton === 'object' && primaryButton?.url) return primaryButton.url;
    return '';
  };

  const getSecondaryButtonLink = () => {
    if (secondaryButtonLink) return secondaryButtonLink;
    if (typeof secondaryButton === 'object' && secondaryButton?.url) return secondaryButton.url;
    return '';
  };

  // Helper function to validate URL
  const isValidUrl = (url: string): boolean => {
    if (!url || url.trim() === '') return false;
    try {
      new URL(url);
      return true;
    } catch {
      // Also allow relative URLs that start with /
      return url.startsWith('/');
    }
  };

  const primaryLink = getPrimaryButtonLink();
  const secondaryLink = getSecondaryButtonLink();
  
  // Only use links if they're valid URLs
  const validPrimaryLink = isValidUrl(primaryLink) ? primaryLink : '';
  const validSecondaryLink = isValidUrl(secondaryLink) ? secondaryLink : '';
  
  // Don't render the container if no buttons will be shown
  if (!validPrimaryLink && !validSecondaryLink) {
    return null;
  }

  return (
    <div className="mt-8 flex justify-center gap-4 flex-wrap">
      {validPrimaryLink && (
        <Link href={validPrimaryLink}>
          <Button size="lg">{getPrimaryButtonText()}</Button>
        </Link>
      )}
      {validSecondaryLink && (
        <Link href={validSecondaryLink}>
          <Button size="lg" variant="outline">
            {getSecondaryButtonText()}
          </Button>
        </Link>
      )}
    </div>
  );
};

// Social proof section component (animation handled by AnimatedGroup)
const SocialProof = ({ trustedByText, trustedByTextColor, trustedByCount, trustedByAvatars, backgroundColor }: { trustedByText?: string; trustedByTextColor?: string; trustedByCount?: string; trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }>; backgroundColor?: string }) => (
  <div className="mt-8 flex justify-center">
    <TrustedByAvatars badgeText={trustedByText} badgeTextColor={trustedByTextColor} avatars={trustedByAvatars} backgroundColor={backgroundColor} />
  </div>
)

// Hero Image component (animation handled by global system)
const HeroImage = ({ heroImage }: { heroImage?: string }) => {
  if (!heroImage) return null;
  
  return (
    <div className="max-w-6xl mx-auto">
      <AnimatedGroup customSettings={{ stagger: 0.05, duration: 1.2 }}>
        <div className="overflow-hidden md:px-6 sm:mt-8">
          <div
            aria-hidden
            className="bg-linear-to-b to-background absolute inset-0 z-10 from-transparent from-35%"
          />
          <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background overflow-hidden rounded-2xl border shadow-lg shadow-zinc-950/15 ring-1">
            <Image
              className="bg-background relative hidden h-auto w-full rounded-2xl object-cover dark:block"
              src={heroImage}
              alt="app screen"
              width={1100}
              height={675}
              style={{ width: '100%', height: 'auto' }}
            />
            <Image
              className="z-2 relative h-auto w-full rounded-2xl object-cover dark:hidden"
              src={heroImage}
              alt="app screen"
              width={1100}
              height={675}
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
        </div>
      </AnimatedGroup>
      <div className="bg-linear-to-t absolute bottom-0 h-2/3 w-full from-white to-transparent" />
    </div>
  );
}

export { PageHeroBlock };