import { HeroRuixenBlock } from "./HeroRuixenBlock"
import { NavigationBlock } from "./NavigationBlock"
import { FooterBlock } from "./FooterBlock"
import { RichTextBlock } from "@/components/admin/modules/shared-blocks/RichTextBlock"
import type { Block } from "@/lib/actions/site-blocks-actions"

interface BlockPropertiesPanelProps {
  selectedBlock: Block | null
  updateBlockContent: (field: string, value: any) => void
  siteId: string
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId
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
                primaryButtonLink={selectedBlock.content.primaryButtonLink || ''}
                secondaryButtonLink={selectedBlock.content.secondaryButtonLink || ''}
                backgroundColor={selectedBlock.content.backgroundColor || '#ffffff'}
                showRainbowButton={selectedBlock.content.showRainbowButton || false}
                githubLink={selectedBlock.content.githubLink || ''}
                showParticles={selectedBlock.content.showParticles || false}
                trustedByText={selectedBlock.content.trustedByText || 'users'}
                trustedByCount={selectedBlock.content.trustedByCount || '10k+'}
                trustedByAvatars={selectedBlock.content.trustedByAvatars || [
                  { src: "", alt: "User 1", fallback: "U1" },
                  { src: "", alt: "User 2", fallback: "U2" },
                  { src: "", alt: "User 3", fallback: "U3" }
                ]}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onPrimaryButtonChange={(value) => updateBlockContent('primaryButton', value)}
                onSecondaryButtonChange={(value) => updateBlockContent('secondaryButton', value)}
                onPrimaryButtonLinkChange={(value) => updateBlockContent('primaryButtonLink', value)}
                onSecondaryButtonLinkChange={(value) => updateBlockContent('secondaryButtonLink', value)}
                onBackgroundColorChange={(value) => updateBlockContent('backgroundColor', value)}
                onShowRainbowButtonChange={(value) => updateBlockContent('showRainbowButton', value)}
                onGithubLinkChange={(value) => updateBlockContent('githubLink', value)}
                onShowParticlesChange={(value) => updateBlockContent('showParticles', value)}
                onTrustedByTextChange={(value) => updateBlockContent('trustedByText', value)}
                onTrustedByCountChange={(value) => updateBlockContent('trustedByCount', value)}
                onTrustedByAvatarsChange={(avatars) => updateBlockContent('trustedByAvatars', avatars)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            {selectedBlock.type === 'navigation' && (
              <NavigationBlock
                logo={selectedBlock.content.logo || ''}
                links={selectedBlock.content.links || []}
                buttons={selectedBlock.content.buttons || []}
                style={selectedBlock.content.style || { backgroundColor: '#ffffff', textColor: '#000000' }}
                onLogoChange={(value) => updateBlockContent('logo', value)}
                onLinksChange={(links) => updateBlockContent('links', links)}
                onButtonsChange={(buttons) => updateBlockContent('buttons', buttons)}
                onStyleChange={(style) => updateBlockContent('style', style)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            {selectedBlock.type === 'footer' && (
              <FooterBlock
                logo={selectedBlock.content.logo || ''}
                copyright={selectedBlock.content.copyright || ''}
                links={selectedBlock.content.links || []}
                socialLinks={selectedBlock.content.socialLinks || []}
                style={selectedBlock.content.style || { backgroundColor: '#1f2937', textColor: '#ffffff' }}
                onLogoChange={(value) => updateBlockContent('logo', value)}
                onCopyrightChange={(value) => updateBlockContent('copyright', value)}
                onLinksChange={(links) => updateBlockContent('links', links)}
                onSocialLinksChange={(socialLinks) => updateBlockContent('socialLinks', socialLinks)}
                onStyleChange={(style) => updateBlockContent('style', style)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            {selectedBlock.type === 'rich-text' && (
              <RichTextBlock
                content={{
                  title: selectedBlock.content.title || '',
                  subtitle: selectedBlock.content.subtitle || '',
                  headerAlign: selectedBlock.content.headerAlign || 'left',
                  content: selectedBlock.content.content || ''
                }}
                onContentChange={(contentObj) => {
                  updateBlockContent('title', contentObj.title)
                  updateBlockContent('subtitle', contentObj.subtitle)
                  updateBlockContent('headerAlign', contentObj.headerAlign)
                  updateBlockContent('content', contentObj.content)
                }}
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