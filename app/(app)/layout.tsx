import { OperationalLayout } from "@/components/layout/operational-layout"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentShellUser()

  return <OperationalLayout currentUser={currentUser}>{children}</OperationalLayout>
}

async function getCurrentShellUser() {
  const supabase = await createClient()
  const db = supabase as any
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await db
    .from('user_profiles')
    .select('email, first_name, last_name, primary_role_id')
    .eq('id', user.id)
    .maybeSingle()

  let roleLabel = 'Staff'
  if (profile?.primary_role_id) {
    const { data: role } = await db
      .from('roles')
      .select('role_code, role_name')
      .eq('id', profile.primary_role_id)
      .maybeSingle()

    roleLabel = role?.role_name || formatRole(role?.role_code) || roleLabel
  }

  const email = profile?.email || user.email || ''
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || email.split('@')[0] || 'Staff user'

  return {
    displayName,
    roleLabel,
    initials: getInitials(displayName || email),
  }
}

function formatRole(roleCode?: string | null) {
  if (!roleCode) return null
  return roleCode.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

function getInitials(value: string) {
  const parts = value
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)

  return (parts[0]?.[0] || 'S').toUpperCase() + (parts[1]?.[0] || '').toUpperCase()
}
