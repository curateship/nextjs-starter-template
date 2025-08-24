import { Card } from '@/components/ui/card'
import { BlockContainer } from '@/components/ui/block-container'
import Image from 'next/image'

interface Feature {
  id: string
  image: string
  title: string
  description: string
}

interface ProductFeaturesBlockProps {
  headerTitle?: string
  headerSubtitle?: string
  headerAlign?: 'left' | 'center'
  features?: Feature[]
}

const ProductFeaturesBlock = ({
  headerTitle = '',
  headerSubtitle = '',
  headerAlign = "center",
  features = []
}: ProductFeaturesBlockProps) => {
  // Show default features if none provided
  const displayFeatures = features.length > 0 ? features : [
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
      className="white"
      header={{
        title: headerTitle,
        subtitle: headerSubtitle,
        align: headerAlign
      }}
    >
      <div className="mt-8 grid gap-6 sm:grid-cols-2 md:mt-16 md:grid-cols-3 md:gap-8">
        {displayFeatures.map((feature, index) => (
          <div key={feature.id} className="space-y-4">
            <Card
              className="aspect-video overflow-hidden px-6"
              variant="soft"
            >
              {feature.image ? (
                <div className="h-full translate-y-6 rounded-md overflow-hidden">
                  <Image
                    src={feature.image}
                    alt={feature.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                </div>
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