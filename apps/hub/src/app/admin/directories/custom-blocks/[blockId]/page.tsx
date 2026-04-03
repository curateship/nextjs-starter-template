import { DirectoryCustomBlockBuilder } from "@/components/admin/directory-builder/custom-blocks/DirectoryCustomBlockBuilder"

interface DirectoryCustomBlockPageProps {
  params: Promise<{
    blockId: string
  }>
}

export default async function DirectoryCustomBlockPage({ params }: DirectoryCustomBlockPageProps) {
  const { blockId } = await params
  return <DirectoryCustomBlockBuilder templateId={blockId} />
}
