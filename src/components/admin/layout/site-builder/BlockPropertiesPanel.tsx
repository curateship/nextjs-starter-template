import { HeroRuixenBlock } from "./HeroRuixenBlock"
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
              <div className="p-4 border rounded">
                <p>Navigation Block Editor</p>
                <p className="text-sm text-muted-foreground">Coming soon...</p>
              </div>
            )}
            {selectedBlock.type === 'footer' && (
              <div className="p-4 border rounded">
                <p>Footer Block Editor</p>
                <p className="text-sm text-muted-foreground">Coming soon...</p>
              </div>
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