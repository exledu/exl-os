import { LeadDetail } from '@/components/leads/LeadDetail'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LeadDetail leadId={Number(id)} />
}
