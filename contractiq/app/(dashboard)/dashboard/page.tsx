import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from '@/components/dashboard/DashboardContent'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  return <DashboardContent email={user.email ?? ''} />
}
