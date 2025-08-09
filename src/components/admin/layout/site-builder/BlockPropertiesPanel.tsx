import { HeroRuixenBlock } from "./HeroRuixenBlock"
import { NavigationBlock } from "./NavigationBlock"
import { FooterBlock } from "./FooterBlock"
import type { Block } from "@/lib/actions/site-blocks-actions"

interface BlockPropertiesPanelProps {
  selectedBlock: Block | null
  updateBlockContent: (field: string, value: any) => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent
}: BlockPropertiesPanelProps) {
  return (
    <div className="w-[845px] border-r bg-muted/30 p-4 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
            {selectedBlock.type === 'hero' && (
              <HeroRuixenBlock
                title={selectedBlock.content.title || ''}
                subtitle={selectedBlock.content.subtitle || ''}
                primaryButton={selectedBlock.content.primaryButton || ''}
                secondaryButton={selectedBlock.content.secondaryButton || ''}
                showRainbowButton={selectedBlock.content.showRainbowButton || false}
                githubLink={selectedBlock.content.githubLink || ''}
                showParticles={selectedBlock.content.showParticles || false}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onPrimaryButtonChange={(value) => updateBlockContent('primaryButton', value)}
                onSecondaryButtonChange={(value) => updateBlockContent('secondaryButton', value)}
                onShowRainbowButtonChange={(value) => updateBlockContent('showRainbowButton', value)}
                onGithubLinkChange={(value) => updateBlockContent('githubLink', value)}
                onShowParticlesChange={(value) => updateBlockContent('showParticles', value)}
              />
            )}
            {selectedBlock.type === 'navigation' && (
              <NavigationBlock
                logo={selectedBlock.content.logo || ''}
                links={selectedBlock.content.links || []}
                style={selectedBlock.content.style || { backgroundColor: '#ffffff', textColor: '#000000' }}
                onLogoChange={(value) => updateBlockContent('logo', value)}
                onLinksChange={(links) => updateBlockContent('links', links)}
                onStyleChange={(style) => updateBlockContent('style', style)}
              />
            )}
            {selectedBlock.type === 'footer' && (
              <FooterBlock
                copyright={selectedBlock.content.copyright || ''}
                links={selectedBlock.content.links || []}
                socialLinks={selectedBlock.content.socialLinks || []}
                style={selectedBlock.content.style || { backgroundColor: '#1f2937', textColor: '#ffffff' }}
                onCopyrightChange={(value) => updateBlockContent('copyright', value)}
                onLinksChange={(links) => updateBlockContent('links', links)}
                onSocialLinksChange={(socialLinks) => updateBlockContent('socialLinks', socialLinks)}
                onStyleChange={(style) => updateBlockContent('style', style)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="text-center text-muted-foreground">
          <p>Select a block to edit its properties</p>
        </div>
      )}
    </div>
  )
}