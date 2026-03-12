import { Card } from '@/components/ui/card'
import { BlockContainer } from '@/components/frontend/layout/block-container'
import Image from 'next/image'

// Helper function to detect media type from URL
const getMediaType = (url: string): 'image' | 'video' | 'unknown' => {
  if (!url) return 'unknown'
  const ext = url.split('.').pop()?.toLowerCase()
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv']
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
  
  if (videoExts.includes(ext || '')) return 'video'
  if (imageExts.includes(ext || '')) return 'image'
  return 'unknown'
}

interface Feature {
  id: string
  image: string
  title: string
  description: string
  mediaType?: 'image' | 'video'
}

interface ProductFeaturesBlockProps {
  header?: string
  subheader?: string
  headerAlign?: 'left' | 'center'
  featuresCollection?: Feature[]
  visibility?: Record<string, boolean>
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

const ProductFeaturesBlock = ({
  header = '',
  subheader = '',
  headerAlign = "center",
  featuresCollection = [],
  visibility,
  siteWidth = 'custom',
  customWidth
}: ProductFeaturesBlockProps) => {
  // Show default features if none provided
  const displayFeatures = featuresCollection.length > 0 ? featuresCollection : [
    {
      id: 'default-1',
      image: '',
      title: 'Marketing Campaigns',
      description: 'Effortlessly book and manage your meetings. Stay on top of your schedule.'
    },
    {
      id: 'default-2', 
      image: '',
      title: 'AI Meeting Scheduler',
      description: 'Effortlessly book and manage your meetings. Stay on top of your schedule.'
    },
    {
      id: 'default-3',
      image: '',
      title: 'Task Automation',
      description: 'Effortlessly book and manage your meetings. Stay on top of your schedule.'
    }
  ]

  return (
    <BlockContainer
      id="features"
      className="white"
      siteWidth={siteWidth}
      customWidth={customWidth}
      header={{
        title: visibility?.header !== false ? header : '',
        subtitle: visibility?.subheader !== false ? subheader : '',
        align: headerAlign
      }}
    >
      <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3 md:gap-12">
        {displayFeatures.map((feature) => (
          <div key={feature.id} className="space-y-4">
            <Card
              className="aspect-video overflow-hidden px-6 flex flex-col mx-0"
              variant="soft"
            >
              {feature.image ? (
                <>
                  <div className="w-full h-auto translate-y-6 rounded-t-md overflow-hidden">
                    {getMediaType(feature.image) === 'video' ? (
                      <video
                        src={`/api/media/proxy?url=${encodeURIComponent(feature.image)}`}
                        className="w-full h-auto object-cover object-top"
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                      />
                    ) : (
                      <Image
                        src={feature.image}
                        alt={feature.title}
                        width={400}
                        height={225}
                        className="w-full h-auto object-cover object-top"
                        sizes="(max-width: 640px) 384px, (max-width: 1024px) 50vw, 384px"
                      />
                    )}
                  </div>
                  <div className="flex-1 bg-white translate-y-6 rounded-b-md" />
                </>
              ) : (
                <Card className="h-full translate-y-6" />
              )}
            </Card>
            <div className="sm:max-w-sm">
              <h3 className="text-foreground text-xl font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground my-4 text-lg">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </BlockContainer>
  )
}

export { ProductFeaturesBlock }