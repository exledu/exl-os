import { TermGridView } from '@/components/terms/TermGridView'

export const dynamic = 'force-dynamic'

export default async function TermDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TermGridView termId={Number(id)} />
}
