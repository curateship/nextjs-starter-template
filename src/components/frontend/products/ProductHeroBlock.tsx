"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { HERO_STYLE_RENDERERS } from "./hero-styles";

// Fields that were previously at the content root before the styleConfig migration
const LEGACY_STYLE_FIELDS = [
  'heroImage', 'showHeroImage',
  'showParticles', 'trustedByText', 'trustedByCount',
  'trustedByAvatars', 'backgroundPattern', 'backgroundPatternSize',
  'backgroundPatternOpacity', 'showTrustedByBadge',
] as const;

interface ProductHeroBlockProps {
  className?: string;
  title?: string;
  subtitle?: string;
  primaryButton?: string;
  secondaryButton?: string;
  primaryButtonLink?: string;
  secondaryButtonLink?: string;
  primaryButtonStyle?: string;
  secondaryButtonStyle?: string;
  heroStyle?: string;
  styleConfig?: Record<string, Record<string, any>>;
  // Legacy fields (for migration fallback)
  trustedByText?: string;
  trustedByCount?: string;
  trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }>;
  backgroundPattern?: string;
  backgroundPatternSize?: string;
  backgroundPatternOpacity?: number;
  heroImage?: string;
  showHeroImage?: boolean;
  showParticles?: boolean;
  showTrustedByBadge?: boolean;
  [key: string]: any;
}

// Hero title component
const HeroTitle = ({ title }: { title?: string }) => {
  if (!title || !title.trim()) return null;
  return (
    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold py-2 md:py-5 leading-none tracking-tight">
      {title}
    </h1>
  );
};

// Hero subtitle component
const HeroSubtitle = ({ subtitle }: { subtitle?: string }) => {
  if (!subtitle || !subtitle.trim()) return null;
  return (
    <p className="text-lg text-muted-foreground max-w-xl mx-auto">
      {subtitle}
    </p>
  );
};

// Call-to-action buttons component with scroll target support
const CTAButtons = ({ primaryButton, secondaryButton, primaryButtonLink, secondaryButtonLink }: { primaryButton?: string; secondaryButton?: string; primaryButtonLink?: string; secondaryButtonLink?: string }) => {
  const hasPrimaryButton = primaryButton && primaryButton.trim()
  const hasSecondaryButton = secondaryButton && secondaryButton.trim()

  if (!hasPrimaryButton && !hasSecondaryButton) return null

  const scrollToTarget = (targetId: string) => {
    const targetElement = document.querySelector(targetId)
    if (!targetElement) return
    const scrollOffset = 80
    const elementTop = targetElement.getBoundingClientRect().top + window.pageYOffset
    window.scrollTo({ top: elementTop - scrollOffset, behavior: 'smooth' })
  }

  const handlePrimaryClick = () => {
    if (primaryButtonLink && primaryButtonLink.startsWith('#')) {
      if (document.querySelector(primaryButtonLink)) {
        scrollToTarget(primaryButtonLink)
      }
    }
  }

  const handleSecondaryClick = () => {
    if (secondaryButtonLink && secondaryButtonLink.startsWith('#')) {
      if (document.querySelector(secondaryButtonLink)) {
        scrollToTarget(secondaryButtonLink)
      }
    }
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
            <Button size="lg" variant="outline">{secondaryButton}</Button>
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

const ProductHeroBlock = (props: ProductHeroBlockProps) => {
  const {
    title,
    subtitle,
    primaryButton,
    secondaryButton,
    primaryButtonLink,
    secondaryButtonLink,
    primaryButtonStyle,
    secondaryButtonStyle,
    heroStyle = 'default',
    styleConfig,
  } = props;

  // Resolve the style config: prefer styleConfig[heroStyle], fall back to legacy root-level fields
  let resolvedConfig: Record<string, any>;
  if (styleConfig && styleConfig[heroStyle]) {
    resolvedConfig = styleConfig[heroStyle];
  } else {
    resolvedConfig = {};
    LEGACY_STYLE_FIELDS.forEach(field => {
      if (props[field] !== undefined) {
        resolvedConfig[field] = props[field];
      }
    });
  }

  const StyleRenderer = HERO_STYLE_RENDERERS[heroStyle] || HERO_STYLE_RENDERERS.default;

  const sharedContent = {
    title,
    subtitle,
    primaryButton,
    secondaryButton,
    primaryButtonLink,
    secondaryButtonLink,
    primaryButtonStyle,
    secondaryButtonStyle,
  };

  return (
    <section id="hero" className="relative w-full flex flex-col items-center justify-center px-6 pt-12 pb-4 md:pb-10 overflow-hidden">
      <StyleRenderer config={resolvedConfig} sharedContent={sharedContent}>
        <HeroTitle title={title} />
        <HeroSubtitle subtitle={subtitle} />
        <CTAButtons
          primaryButton={primaryButton}
          secondaryButton={secondaryButton}
          primaryButtonLink={primaryButtonLink}
          secondaryButtonLink={secondaryButtonLink}
        />
      </StyleRenderer>
    </section>
  );
};

export { ProductHeroBlock };
