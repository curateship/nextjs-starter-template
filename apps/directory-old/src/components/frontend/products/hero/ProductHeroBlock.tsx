"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import Link from "@/components/app-link";
import { HERO_STYLE_RENDERERS } from ".";
import { PRODUCT_EMAIL_MODAL_HREF, PRODUCT_EMAIL_MODAL_OPEN_EVENT } from "@/lib/actions/products/email-modal";

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
  siteWidth?: 'full' | 'custom';
  customWidth?: number;
  visibility?: Record<string, boolean>;
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

const normalizeButtonLink = (link?: string) => link?.trim() || "";

const isProductEmailModalLink = (link?: string) => {
  const normalizedLink = normalizeButtonLink(link).toLowerCase();
  return normalizedLink === PRODUCT_EMAIL_MODAL_HREF || normalizedLink === "product-email-modal";
}

// Call-to-action buttons component with scroll target and modal support
const CTAButtons = ({ primaryButton, secondaryButton, primaryButtonLink, secondaryButtonLink }: { primaryButton?: string; secondaryButton?: string; primaryButtonLink?: string; secondaryButtonLink?: string }) => {
  const hasPrimaryButton = primaryButton && primaryButton.trim()
  const hasSecondaryButton = secondaryButton && secondaryButton.trim()

  if (!hasPrimaryButton && !hasSecondaryButton) return null

  const scrollToTarget = (targetId: string) => {
    let targetElement: Element | null = null
    try {
      targetElement = document.querySelector(targetId)
    } catch {
      return
    }

    if (!targetElement) return
    const scrollOffset = 80
    const elementTop = targetElement.getBoundingClientRect().top + window.pageYOffset
    window.scrollTo({ top: elementTop - scrollOffset, behavior: 'smooth' })
  }

  const openProductEmailModal = () => {
    const target = document.querySelector<HTMLElement>('[data-product-email-modal-block="true"]')
    window.dispatchEvent(new CustomEvent(PRODUCT_EMAIL_MODAL_OPEN_EVENT, {
      detail: {
        blockId: target?.dataset.productEmailModalBlockId,
      },
    }))
  }

  const handleButtonClick = (link?: string) => {
    const normalizedLink = normalizeButtonLink(link)

    if (isProductEmailModalLink(normalizedLink)) {
      openProductEmailModal()
      return
    }

    if (normalizedLink.startsWith('#')) {
      scrollToTarget(normalizedLink)
    }
  }

  const shouldUseLink = (link?: string) => {
    const normalizedLink = normalizeButtonLink(link)
    return normalizedLink && !normalizedLink.startsWith('#') && !isProductEmailModalLink(normalizedLink)
  }

  return (
    <div className="mt-8 flex justify-center gap-4 flex-wrap">
      {hasPrimaryButton && (
        shouldUseLink(primaryButtonLink) ? (
          <Link href={normalizeButtonLink(primaryButtonLink)}>
            <Button size="lg">{primaryButton}</Button>
          </Link>
        ) : (
          <Button size="lg" onClick={() => handleButtonClick(primaryButtonLink)}>
            {primaryButton}
          </Button>
        )
      )}
      {hasSecondaryButton && (
        shouldUseLink(secondaryButtonLink) ? (
          <Link href={normalizeButtonLink(secondaryButtonLink)}>
            <Button size="lg" variant="outline">{secondaryButton}</Button>
          </Link>
        ) : (
          <Button size="lg" variant="outline" onClick={() => handleButtonClick(secondaryButtonLink)}>
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
    siteWidth,
    customWidth,
    visibility,
  } = props;

  const resolvedConfig: Record<string, any> = { ...(styleConfig?.[heroStyle] || {}) };

  if (resolvedConfig.siteWidth === undefined && siteWidth) {
    resolvedConfig.siteWidth = siteWidth;
  }

  if (resolvedConfig.contentMaxWidth === undefined && customWidth) {
    resolvedConfig.contentMaxWidth = customWidth;
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
    <section id="hero" className="relative w-full flex flex-col items-center justify-center -mt-(--site-page-start-offset,0px) pt-[calc(var(--site-page-start-offset,0px)+2rem)] pb-4 md:pb-10 overflow-hidden">
      <StyleRenderer config={resolvedConfig} visibility={visibility} sharedContent={sharedContent}>
        {visibility?.title !== false && <HeroTitle title={title} />}
        {visibility?.subtitle !== false && <HeroSubtitle subtitle={subtitle} />}
        {(visibility?.primaryButton !== false || visibility?.secondaryButton !== false) && (
          <CTAButtons
            primaryButton={visibility?.primaryButton !== false ? primaryButton : undefined}
            secondaryButton={visibility?.secondaryButton !== false ? secondaryButton : undefined}
            primaryButtonLink={primaryButtonLink}
            secondaryButtonLink={secondaryButtonLink}
          />
        )}
      </StyleRenderer>
    </section>
  );
};

export { ProductHeroBlock };
