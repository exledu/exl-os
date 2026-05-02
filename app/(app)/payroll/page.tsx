export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { PayrollView } from '@/components/payroll/PayrollView'
import { FinanceGate } from '@/components/finance/FinanceGate'

const COOKIE_NAME = 'exl-finance-unlock'
const COOKIE_VALUE = 'unlocked'

export default async function PayrollPage() {
  const store = await cookies()
  const unlocked = store.get(COOKIE_NAME)?.value === COOKIE_VALUE
  if (!unlocked) return <FinanceGate />
  return <PayrollView />
}
