import { Card } from '@/components/ui/card'
import { BlockContainer } from '@/components/ui/block-container'

export default function ProductFeatureGridBlock() {
    return (
        <BlockContainer 
            className="white"
            header={{
                title: "Effortless Task Management",
                subtitle: "Automate your tasks and workflows by connecting your favorite tools like Notion, Todoist, and more. AI-powered scheduling helps you stay on track and adapt to changing priorities.",
                align: "center"
            }}
        >
            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:mt-16 md:grid-cols-3">
                <div className="space-y-4">
                    <Card
                        className="aspect-video overflow-hidden px-6"
                        variant="soft">
                        <Card className="h-full translate-y-6" />
                    </Card>
                    <div className="sm:max-w-sm">
                        <h3 className="text-foreground text-xl font-semibold">Marketing Campaigns</h3>
                        <p className="text-muted-foreground my-4 text-lg">Effortlessly book and manage your meetings. Stay on top of your schedule.</p>
                    </div>
                </div>
                <div className="space-y-4">
                    <Card
                        className="aspect-video overflow-hidden p-6"
                        variant="soft">
                        <Card className="h-full" />
                    </Card>
                    <div className="sm:max-w-sm">
                        <h3 className="text-foreground text-xl font-semibold">AI Meeting Scheduler</h3>
                        <p className="text-muted-foreground my-4 text-lg">Effortlessly book and manage your meetings. Stay on top of your schedule.</p>
                    </div>
                </div>
                <div className="space-y-4">
                    <Card
                        className="aspect-video overflow-hidden"
                        variant="soft">
                        <Card className="translate-6 h-full" />
                    </Card>
                    <div className="sm:max-w-sm">
                        <h3 className="text-foreground text-xl font-semibold">AI Meeting Scheduler</h3>
                        <p className="text-muted-foreground my-4 text-lg">Effortlessly book and manage your meetings. Stay on top of your schedule.</p>
                    </div>
                </div>
            </div>
        </BlockContainer>
    )
}