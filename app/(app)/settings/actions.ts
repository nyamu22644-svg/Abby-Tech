'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import crypto from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const settingsSchema = z.object({
  business_name: z.string().trim().min(1, 'Facility name is required'),
  timezone: z.string().trim().min(1, 'Timezone is required'),
  currency_code: z.string().trim().length(3, 'Currency code must be 3 letters').transform((value) => value.toUpperCase()),
  default_incubation_days: z.coerce.number().int().positive('Incubation days must be greater than 0'),
  default_hatch_rate_target: z.coerce.number().min(0).max(100),
  default_chick_price: z.coerce.number().min(0),
  alerts_enabled: z.enum(['on']).optional(),
})

const receiptSchema = z.object({
  receipt_title: z.string().trim().optional(),
  receipt_tagline: z.string().trim().optional(),
  receipt_phone: z.string().trim().optional(),
  receipt_location: z.string().trim().optional(),
  receipt_footer: z.string().trim().optional(),
  receipt_show_system_branding: z.enum(['on']).optional(),
})

const breedCatalogSchema = z.object({
  breed_options: z.string().trim().optional(),
})

const profileRoleSchema = z.object({
  first_name: z.string().trim().optional(),
  last_name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  role_code: z.enum(['MANAGER', 'OPERATOR', 'VIEWER']),
})

const sensorSchema = z.object({
  name: z.string().trim().min(1, 'Sensor name is required'),
  serial_number: z.string().trim().min(1, 'Serial number is required'),
  ingest_token: z.string().trim().min(8, 'Device ingest key must be at least 8 characters'),
  device_type: z.enum(['INCUBATOR_SENSOR', 'BROODER_SENSOR', 'ENVIRONMENT_SENSOR', 'POWER_MONITOR', 'GENERATOR_MONITOR', 'OTHER']),
  mac_address: z.string().trim().optional(),
  firmware_version: z.string().trim().optional(),
  incubator_id: z.string().trim().optional(),
})

const staffInviteSchema = z.object({
  email: z.string().trim().email(),
  first_name: z.string().trim().optional(),
  last_name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  role_code: z.enum(['MANAGER', 'OPERATOR', 'VIEWER']),
})

const deviceStatusSchema = z.object({
  device_id: z.string().uuid(),
  status: z.enum(['ONLINE', 'OFFLINE', 'MAINTENANCE', 'DECOMMISSIONED']),
})

const incubatorStatusSchema = z.object({
  incubator_id: z.string().uuid(),
  operational_status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE']),
  maintenance_status: z.enum(['GOOD', 'DUE_FOR_MAINTENANCE', 'NEEDS_REPAIR']),
})

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function saveBusinessSettings(formData: FormData) {
  const parsed = settingsSchema.safeParse({
    business_name: formData.get('business_name'),
    timezone: formData.get('timezone'),
    currency_code: formData.get('currency_code'),
    default_incubation_days: formData.get('default_incubation_days'),
    default_hatch_rate_target: formData.get('default_hatch_rate_target'),
    default_chick_price: formData.get('default_chick_price'),
    alerts_enabled: formData.get('alerts_enabled') || undefined,
  })

  if (!parsed.success) {
    redirectWithError('Check the facility settings values and try again.')
  }

  const supabase = await createClient()
  const { user, tenantId } = await ensureTenantForUser(supabase, {
    businessName: parsed.data.business_name,
    timezone: parsed.data.timezone,
    currencyCode: parsed.data.currency_code,
  })
  const db = supabase as any
  const now = new Date().toISOString()
  const settings = parsed.data

  const { error: tenantError } = await db
    .from('tenants')
    .update({
      name: settings.business_name,
      timezone: settings.timezone,
      currency_code: settings.currency_code,
      updated_at: now,
    })
    .eq('id', tenantId)

  if (tenantError) redirectWithError(tenantError.message || 'Failed to update facility.')

  const { error: settingsError } = await db
    .from('business_settings')
    .upsert(
      {
        tenant_id: tenantId,
        business_name: settings.business_name,
        timezone: settings.timezone,
        currency_code: settings.currency_code,
        default_incubation_days: settings.default_incubation_days,
        default_hatch_rate_target: settings.default_hatch_rate_target,
        default_chick_price: settings.default_chick_price,
        alerts_enabled: Boolean(settings.alerts_enabled),
        updated_at: now,
      },
      { onConflict: 'tenant_id' }
    )

  if (settingsError) redirectWithError(settingsError.message || 'Failed to save facility settings.')

  await ensureDefaultRole(db, tenantId, 'MANAGER')
  revalidateSettings()
  redirect('/settings?saved=facility')
}

export async function saveReceiptBranding(formData: FormData) {
  const parsed = receiptSchema.safeParse({
    receipt_title: formData.get('receipt_title'),
    receipt_tagline: formData.get('receipt_tagline'),
    receipt_phone: formData.get('receipt_phone'),
    receipt_location: formData.get('receipt_location'),
    receipt_footer: formData.get('receipt_footer'),
    receipt_show_system_branding: formData.get('receipt_show_system_branding') || undefined,
  })

  if (!parsed.success) redirectWithError('Check the receipt branding values and try again.')

  const supabase = await createClient()
  const { tenantId } = await ensureTenantForUser(supabase)
  const db = supabase as any
  const data = parsed.data

  const { error } = await db
    .from('business_settings')
    .upsert(
      {
        tenant_id: tenantId,
        receipt_title: data.receipt_title || null,
        receipt_tagline: data.receipt_tagline || null,
        receipt_phone: data.receipt_phone || null,
        receipt_location: data.receipt_location || null,
        receipt_footer: data.receipt_footer || null,
        receipt_show_system_branding: Boolean(data.receipt_show_system_branding),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' }
    )

  if (error) redirectWithError(error.message || 'Failed to save receipt branding.')

  revalidateSettings()
  redirect('/settings?saved=receipt')
}

export async function saveBreedCatalog(formData: FormData) {
  const parsed = breedCatalogSchema.safeParse({
    breed_options: formData.get('breed_options'),
  })

  if (!parsed.success) redirectWithError('Check the breed catalog and try again.')

  const supabase = await createClient()
  const { tenantId } = await ensureTenantForUser(supabase)
  const db = supabase as any
  const breeds = (parsed.data.breed_options || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)

  const { error } = await db
    .from('business_settings')
    .upsert(
      {
        tenant_id: tenantId,
        breed_options: breeds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' }
    )

  if (error) redirectWithError(error.message || 'Failed to save breed catalog.')

  revalidateSettings()
  redirect('/settings?saved=breeds')
}

export async function saveCurrentUserProfileAndRole(formData: FormData) {
  const parsed = profileRoleSchema.safeParse({
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    phone: formData.get('phone'),
    role_code: formData.get('role_code'),
  })

  if (!parsed.success) redirectWithError('Check the profile and role values and try again.')

  const supabase = await createClient()
  const { user, tenantId } = await ensureTenantForUser(supabase)
  const db = supabase as any
  const role = await ensureDefaultRole(db, tenantId, parsed.data.role_code)
  const now = new Date().toISOString()

  const { error: profileError } = await db
    .from('user_profiles')
    .update({
      first_name: parsed.data.first_name || null,
      last_name: parsed.data.last_name || null,
      phone: parsed.data.phone || null,
      status: 'ACTIVE',
      primary_role_id: role.id,
      activated_at: now,
      updated_at: now,
    })
    .eq('id', user.id)

  if (profileError) redirectWithError(profileError.message || 'Failed to update profile.')

  await db
    .from('user_roles')
    .update({ is_primary: false })
    .eq('user_id', user.id)

  const { error: userRoleError } = await db
    .from('user_roles')
    .upsert(
      {
        user_id: user.id,
        role_id: role.id,
        is_primary: true,
        assigned_by: user.id,
        assigned_at: now,
      },
      { onConflict: 'user_id,role_id' }
    )

  if (userRoleError) redirectWithError(userRoleError.message || 'Failed to assign role.')

  revalidateSettings()
  redirect('/settings?saved=profile')
}

export async function registerSensorDevice(formData: FormData) {
  const parsed = sensorSchema.safeParse({
    name: formData.get('name'),
    serial_number: formData.get('serial_number'),
    ingest_token: formData.get('ingest_token'),
    device_type: formData.get('device_type'),
    mac_address: formData.get('mac_address'),
    firmware_version: formData.get('firmware_version'),
    incubator_id: formData.get('incubator_id'),
  })

  if (!parsed.success) redirectWithError('Check the sensor values and try again.')

  const supabase = await createClient()
  const { user, tenantId } = await ensureTenantForUser(supabase)
  const db = supabase as any
  const now = new Date().toISOString()
  const input = parsed.data

  const { data: device, error: deviceError } = await db
    .from('devices')
    .insert({
      tenant_id: tenantId,
      device_type: input.device_type,
      name: input.name,
      serial_number: input.serial_number,
      ingest_token_hash: hashSecret(input.ingest_token),
      mac_address: input.mac_address || null,
      firmware_version: input.firmware_version || null,
      status: 'OFFLINE',
      registered_by: user.id,
      installed_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (deviceError || !device?.id) redirectWithError(deviceError?.message || 'Failed to register sensor.')

  if (input.incubator_id) {
    const { error: assignmentError } = await db
      .from('device_assignments')
      .insert({
        device_id: device.id,
        incubator_id: input.incubator_id,
        assigned_by: user.id,
        assigned_at: now,
        is_active: true,
        created_at: now,
        updated_at: now,
      })

    if (assignmentError) redirectWithError(assignmentError.message || 'Failed to assign sensor.')
  }

  revalidateSettings()
  redirect('/settings?saved=sensor')
}

export async function inviteStaffMember(formData: FormData) {
  const parsed = staffInviteSchema.safeParse({
    email: formData.get('email'),
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    phone: formData.get('phone'),
    role_code: formData.get('role_code'),
  })

  if (!parsed.success) redirectWithError('Check the staff invite values and try again.')

  const supabase = await createClient()
  const { user, tenantId } = await ensureTenantForUser(supabase)
  const db = supabase as any
  const role = await ensureDefaultRole(db, tenantId, parsed.data.role_code)
  const now = new Date().toISOString()

  let invitedUserId: string | null = null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: {
        first_name: parsed.data.first_name || null,
        last_name: parsed.data.last_name || null,
        phone: parsed.data.phone || null,
        tenant_id: tenantId,
        role_code: parsed.data.role_code,
      },
      redirectTo: `${process.env.APP_URL || ''}/login`,
    })

    if (error) redirectWithError(error.message || 'Failed to send staff invite.')
    invitedUserId = data.user?.id || null
  } catch (error: any) {
    redirectWithError(error.message || 'SUPABASE_SERVICE_ROLE_KEY is required for staff invites.')
  }

  if (!invitedUserId) redirectWithError('Invite succeeded but Supabase did not return a user id.')

  const { error: profileError } = await db
    .from('user_profiles')
    .upsert(
      {
        id: invitedUserId,
        tenant_id: tenantId,
        email: parsed.data.email,
        first_name: parsed.data.first_name || null,
        last_name: parsed.data.last_name || null,
        phone: parsed.data.phone || null,
        status: 'INVITED',
        primary_role_id: role.id,
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'id' }
    )

  if (profileError) redirectWithError(profileError.message || 'Failed to create staff profile.')

  const { error: userRoleError } = await db
    .from('user_roles')
    .upsert(
      {
        user_id: invitedUserId,
        role_id: role.id,
        is_primary: true,
        assigned_by: user.id,
        assigned_at: now,
      },
      { onConflict: 'user_id,role_id' }
    )

  if (userRoleError) redirectWithError(userRoleError.message || 'Failed to assign staff role.')

  revalidateSettings()
  redirect('/settings?saved=staff')
}

export async function updateDeviceStatus(formData: FormData) {
  const parsed = deviceStatusSchema.safeParse({
    device_id: formData.get('device_id'),
    status: formData.get('status'),
  })

  if (!parsed.success) redirectWithError('Check the sensor status and try again.')

  const supabase = await createClient()
  await ensureTenantForUser(supabase)
  const { error } = await (supabase as any)
    .from('devices')
    .update({
      status: parsed.data.status,
      deleted_at: parsed.data.status === 'DECOMMISSIONED' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.device_id)

  if (error) redirectWithError(error.message || 'Failed to update sensor status.')

  revalidateSettings()
  redirect('/settings?saved=sensor-status')
}

export async function updateIncubatorStatus(formData: FormData) {
  const parsed = incubatorStatusSchema.safeParse({
    incubator_id: formData.get('incubator_id'),
    operational_status: formData.get('operational_status'),
    maintenance_status: formData.get('maintenance_status'),
  })

  if (!parsed.success) redirectWithError('Check the incubator status and try again.')

  const supabase = await createClient()
  await ensureTenantForUser(supabase)
  const { error } = await (supabase as any)
    .from('incubators')
    .update({
      operational_status: parsed.data.operational_status,
      maintenance_status: parsed.data.maintenance_status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.incubator_id)

  if (error) redirectWithError(error.message || 'Failed to update incubator status.')

  revalidateSettings()
  redirect('/settings?saved=incubator-status')
}

async function ensureTenantForUser(
  supabase: SupabaseClient,
  defaults?: { businessName?: string; timezone?: string; currencyCode?: string }
) {
  const db = supabase as any
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await db
    .from('user_profiles')
    .select('id, tenant_id, email, first_name, last_name, phone')
    .eq('id', user.id)
    .maybeSingle()

  let tenantId = profile?.tenant_id || null
  if (!tenantId) {
    const { data: tenant } = await db
      .from('tenants')
      .select('id')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    tenantId = tenant?.id || null
  }

  const now = new Date().toISOString()
  if (!tenantId) {
    const { data: newTenant, error: tenantError } = await db
      .from('tenants')
      .insert({
        name: defaults?.businessName || 'Abbye Chicks Hatchery',
        timezone: defaults?.timezone || 'Africa/Nairobi',
        currency_code: defaults?.currencyCode || 'KES',
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    if (tenantError || !newTenant?.id) redirectWithError(tenantError?.message || 'Failed to create facility record.')
    tenantId = newTenant.id
  }

  if (profile?.id) {
    if (!profile.tenant_id) {
      const { error } = await db
        .from('user_profiles')
        .update({
          tenant_id: tenantId,
          status: 'ACTIVE',
          activated_at: now,
          updated_at: now,
        })
        .eq('id', user.id)

      if (error) redirectWithError(error.message || 'Failed to link user profile to facility.')
    }
  } else {
    const email = user.email || (user.user_metadata as any)?.email
    if (!email) redirectWithError('User email missing. Update the login account email first.')

    const nameParts = email.split('@')[0]?.split(/[._-]/).filter(Boolean) || []
    const { error } = await db
      .from('user_profiles')
      .insert({
        id: user.id,
        tenant_id: tenantId,
        email,
        first_name: (user.user_metadata as any)?.first_name || nameParts[0] || null,
        last_name: (user.user_metadata as any)?.last_name || nameParts.slice(1).join(' ') || null,
        phone: (user.user_metadata as any)?.phone || null,
        status: 'ACTIVE',
        activated_at: now,
        created_at: now,
        updated_at: now,
      })

    if (error) redirectWithError(error.message || 'Failed to create user profile.')
  }

  return { user, tenantId }
}

async function ensureDefaultRole(db: any, tenantId: string, roleCode: 'MANAGER' | 'OPERATOR' | 'VIEWER') {
  const roleName = {
    MANAGER: 'Manager',
    OPERATOR: 'Operator',
    VIEWER: 'Viewer',
  }[roleCode]
  const description = {
    MANAGER: 'Can manage production records and settings.',
    OPERATOR: 'Can record operational hatchery work.',
    VIEWER: 'Can view records without changing operations.',
  }[roleCode]

  const { data: existing, error: existingError } = await db
    .from('roles')
    .select('id, role_code, role_name')
    .eq('tenant_id', tenantId)
    .eq('role_code', roleCode)
    .maybeSingle()

  if (existingError) redirectWithError(existingError.message || 'Failed to read role.')
  if (existing?.id) return existing

  const { data: created, error: createError } = await db
    .from('roles')
    .insert({
      tenant_id: tenantId,
      role_code: roleCode,
      role_name: roleName,
      description,
      is_system: roleCode !== 'MANAGER',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, role_code, role_name')
    .single()

  if (createError || !created?.id) redirectWithError(createError?.message || `Failed to create ${roleName} role.`)
  return created
}

function revalidateSettings() {
  revalidatePath('/settings')
  revalidatePath('/dashboard')
  revalidatePath('/incubation')
  revalidatePath('/orders')
}

function redirectWithError(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`)
}

function hashSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}
