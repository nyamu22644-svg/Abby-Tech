import { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Lock,
  Monitor,
  RadioTower,
  ReceiptText,
  Save,
  Shield,
  Sprout,
  Thermometer,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { RegisterIncubatorDialog } from '../incubation/components/register-incubator-dialog'
import {
  registerSensorDevice,
  inviteStaffMember,
  saveBreedCatalog,
  saveBusinessSettings,
  saveCurrentUserProfileAndRole,
  saveReceiptBranding,
  updateDeviceStatus,
  updateIncubatorStatus,
} from './actions'

export const metadata: Metadata = {
  title: 'Settings | Smart Hatchery OS',
  description: 'Configure facility, equipment, sensors, receipts, breeds, and access.',
}

type SettingsPageProps = {
  searchParams?: Promise<{ saved?: string; error?: string }>
}

const DEFAULT_BREEDS = [
  'KARI Improved Kienyeji',
  'Improved Kienyeji',
  'Broiler',
  'Layer',
  'Local Kienyeji',
]

const DEVICE_TYPES = [
  ['INCUBATOR_SENSOR', 'Incubator sensor'],
  ['BROODER_SENSOR', 'Brooder sensor'],
  ['ENVIRONMENT_SENSOR', 'Environment sensor'],
  ['POWER_MONITOR', 'Power monitor'],
  ['GENERATOR_MONITOR', 'Generator monitor'],
  ['OTHER', 'Other'],
] as const

const DEVICE_STATUSES = ['ONLINE', 'OFFLINE', 'MAINTENANCE', 'DECOMMISSIONED'] as const
const INCUBATOR_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const
const MAINTENANCE_STATUSES = ['GOOD', 'DUE_FOR_MAINTENANCE', 'NEEDS_REPAIR'] as const

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = searchParams ? await searchParams : {}
  const supabase = await createClient()
  const db = supabase as any
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await db
        .from('user_profiles')
        .select('id, tenant_id, email, first_name, last_name, phone, status, primary_role_id')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null }

  const { data: tenant } = profile?.tenant_id
    ? await db
        .from('tenants')
        .select('id, name, timezone, currency_code')
        .eq('id', profile.tenant_id)
        .maybeSingle()
    : await db
        .from('tenants')
        .select('id, name, timezone, currency_code')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

  const [
    { data: settings },
    { data: incubators },
    { data: devices },
    { data: assignments },
    { data: roles },
    { count: profileCount },
    { count: batchCount },
    { count: customerCount },
    { count: orderCount },
  ] = await Promise.all([
    tenant?.id
      ? db.from('business_settings').select('*').eq('tenant_id', tenant.id).maybeSingle()
      : { data: null },
    db
      .from('incubators')
      .select('id, name, unit_code, type, capacity, operational_status, maintenance_status, controller_model, serial_number, location')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    db
      .from('devices')
      .select('id, name, serial_number, mac_address, firmware_version, device_type, status, installed_at, last_seen_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    db
      .from('device_assignments')
      .select('device_id, incubator_id, is_active, incubators(name)')
      .eq('is_active', true),
    tenant?.id
      ? db.from('roles').select('id, role_code, role_name').eq('tenant_id', tenant.id).order('role_name', { ascending: true })
      : { data: [] },
    db.from('user_profiles').select('id', { count: 'exact', head: true }),
    db.from('egg_batches').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    db.from('customers').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    db.from('orders').select('id', { count: 'exact', head: true }).is('deleted_at', null),
  ])

  const incubatorRows = incubators || []
  const deviceRows = devices || []
  const roleRows = roles || []
  const assignmentByDevice = new Map(
    (assignments || []).map((assignment: any) => [assignment.device_id, assignment])
  )
  const selectedRole = roleRows.find((role: any) => role.id === profile?.primary_role_id)?.role_code || 'MANAGER'

  const facilityName = settings?.business_name || tenant?.name || ''
  const timezone = settings?.timezone || tenant?.timezone || 'Africa/Nairobi'
  const currencyCode = settings?.currency_code || tenant?.currency_code || 'KES'
  const incubationDays = settings?.default_incubation_days ?? 21
  const hatchRateTarget = settings?.default_hatch_rate_target ?? 85
  const chickPrice = settings?.default_chick_price ?? 130
  const alertsEnabled = settings?.alerts_enabled ?? true
  const breedOptions = Array.isArray(settings?.breed_options) && settings.breed_options.length > 0
    ? settings.breed_options
    : DEFAULT_BREEDS
  const operatingDataCount = Number(batchCount || 0) + Number(customerCount || 0) + Number(orderCount || 0)

  const readiness = [
    {
      label: 'Facility defaults',
      complete: Boolean(settings?.id),
      helper: settings?.id ? 'Saved' : 'Save the facility form first',
    },
    {
      label: 'Incubator equipment',
      complete: incubatorRows.length > 0,
      helper: incubatorRows.length > 0 ? `${incubatorRows.length.toLocaleString()} registered` : 'Register the real machine',
    },
    {
      label: 'Operating data',
      complete: operatingDataCount === 0,
      helper: operatingDataCount === 0 ? 'Clean for live start' : `${operatingDataCount.toLocaleString()} records present`,
    },
    {
      label: 'Current account',
      complete: Boolean(profile?.primary_role_id),
      helper: profile?.primary_role_id ? 'Role assigned' : 'Assign role below',
    },
  ]

  return (
    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure the farm record, equipment, sensor registry, breeds, receipts, and access.
          </p>
        </div>
        <Button render={<Link href="/incubation" />} variant="outline" className="h-9">
          Open Incubation
        </Button>
      </section>

      {params.saved ? (
        <div className="rounded-button border border-success/20 bg-success/10 px-4 py-3 text-sm font-medium text-success">
          Settings saved.
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-button border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {params.error}
        </div>
      ) : null}

      <Card className="border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          {readiness.map((item) => (
            <div key={item.label} className="flex items-start gap-3 rounded-button border border-border bg-muted/10 p-3">
              <span className="mt-0.5">
                {item.complete ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-warning" />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.helper}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <div className="space-y-5">
          <form action={saveBusinessSettings}>
            <Section
              icon={Monitor}
              title="Facility Defaults"
              description="Used for hatch dates, currency, pricing, and alert behavior."
              action={<SaveButton />}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Facility Name" htmlFor="business_name" className="sm:col-span-2">
                  <input id="business_name" name="business_name" required defaultValue={facilityName} placeholder="e.g. Abbye Chicks Hatchery" className={inputClass} />
                </Field>
                <Field label="Timezone" htmlFor="timezone">
                  <input id="timezone" name="timezone" required defaultValue={timezone} className={inputClass} />
                </Field>
                <Field label="Currency Code" htmlFor="currency_code">
                  <input id="currency_code" name="currency_code" required maxLength={3} defaultValue={currencyCode} className={`${inputClass} uppercase`} />
                </Field>
                <Field label="Incubation Cycle Days" htmlFor="default_incubation_days">
                  <input id="default_incubation_days" name="default_incubation_days" type="number" required min="1" defaultValue={incubationDays} className={inputClass} />
                </Field>
                <Field label="Hatch Rate Target (%)" htmlFor="default_hatch_rate_target">
                  <input id="default_hatch_rate_target" name="default_hatch_rate_target" type="number" required min="0" max="100" step="0.01" defaultValue={hatchRateTarget} className={inputClass} />
                </Field>
                <Field label="Default Chick Price" htmlFor="default_chick_price">
                  <input id="default_chick_price" name="default_chick_price" type="number" required min="0" step="0.01" defaultValue={chickPrice} className={inputClass} />
                </Field>
                <label className="flex h-9 items-center gap-3 pt-6 text-sm font-medium text-foreground">
                  <input name="alerts_enabled" type="checkbox" defaultChecked={alertsEnabled} className="h-4 w-4 rounded border-border" />
                  Alerts enabled
                </label>
              </div>
            </Section>
          </form>

          <form action={saveReceiptBranding}>
            <Section
              icon={ReceiptText}
              title="Receipt Branding"
              description="Printed and shared customer receipts use these values."
              action={<SaveButton />}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Receipt Header" htmlFor="receipt_title" className="sm:col-span-2">
                  <input id="receipt_title" name="receipt_title" defaultValue={settings?.receipt_title || facilityName || 'Abbye Chicks'} className={inputClass} />
                </Field>
                <Field label="Phone / WhatsApp" htmlFor="receipt_phone">
                  <input id="receipt_phone" name="receipt_phone" defaultValue={settings?.receipt_phone || ''} className={inputClass} />
                </Field>
                <Field label="Location" htmlFor="receipt_location">
                  <input id="receipt_location" name="receipt_location" defaultValue={settings?.receipt_location || ''} className={inputClass} />
                </Field>
                <Field label="Tagline" htmlFor="receipt_tagline" className="sm:col-span-2">
                  <input id="receipt_tagline" name="receipt_tagline" defaultValue={settings?.receipt_tagline || 'Premium poultry operations'} className={inputClass} />
                </Field>
                <Field label="Footer Note" htmlFor="receipt_footer" className="sm:col-span-2">
                  <textarea id="receipt_footer" name="receipt_footer" defaultValue={settings?.receipt_footer || ''} rows={3} className={textareaClass} />
                </Field>
                <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                  <input name="receipt_show_system_branding" type="checkbox" defaultChecked={settings?.receipt_show_system_branding ?? true} className="h-4 w-4 rounded border-border" />
                  Show Smart Hatchery OS branding on receipts
                </label>
              </div>
            </Section>
          </form>

          <form action={saveBreedCatalog}>
            <Section
              icon={Sprout}
              title="Breed Catalog"
              description="These options guide batch intake and customer order breed requests."
              action={<SaveButton />}
            >
              <Field label="One breed/type per line" htmlFor="breed_options">
                <textarea id="breed_options" name="breed_options" rows={6} defaultValue={breedOptions.join('\n')} className={textareaClass} />
              </Field>
            </Section>
          </form>
        </div>

        <div className="space-y-5">
          <Section
            icon={Monitor}
            title="Incubator Equipment"
            description="Register real machines and keep their operating state current."
            action={<RegisterIncubatorDialog />}
          >
            <div className="space-y-3">
              {incubatorRows.length === 0 ? (
                <EmptyState message="No incubator machines registered yet." />
              ) : (
                incubatorRows.map((incubator: any) => (
                  <form key={incubator.id} action={updateIncubatorStatus} className="rounded-button border border-border bg-muted/10 p-3">
                    <input type="hidden" name="incubator_id" value={incubator.id} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{incubator.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {incubator.controller_model || incubator.type} / {Number(incubator.capacity || 0).toLocaleString()} eggs
                        </p>
                      </div>
                      <Button type="submit" variant="outline" className="h-8 px-3 text-xs">Update</Button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <select name="operational_status" defaultValue={incubator.operational_status || 'ACTIVE'} className={inputClass}>
                        {INCUBATOR_STATUSES.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
                      </select>
                      <select name="maintenance_status" defaultValue={incubator.maintenance_status || 'GOOD'} className={inputClass}>
                        {MAINTENANCE_STATUSES.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
                      </select>
                    </div>
                  </form>
                ))
              )}
            </div>
          </Section>

          <form action={registerSensorDevice}>
            <Section
              icon={RadioTower}
              title="IoT Sensor Registry"
              description="Register sensors and assign them to incubator machines."
              action={<SaveButton label="Register" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Sensor Name" htmlFor="sensor_name">
                  <input id="sensor_name" name="name" required placeholder="e.g. XD 18 Temp Sensor" className={inputClass} />
                </Field>
                <Field label="Serial Number" htmlFor="serial_number">
                  <input id="serial_number" name="serial_number" required className={inputClass} />
                </Field>
                <Field label="ESP Ingest Key" htmlFor="ingest_token">
                  <input id="ingest_token" name="ingest_token" required minLength={8} placeholder="Set the same key in ESP firmware" className={inputClass} />
                </Field>
                <Field label="Sensor Type" htmlFor="device_type">
                  <select id="device_type" name="device_type" defaultValue="INCUBATOR_SENSOR" className={inputClass}>
                    {DEVICE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Assign To" htmlFor="incubator_id">
                  <select id="incubator_id" name="incubator_id" defaultValue="" className={inputClass}>
                    <option value="">Unassigned</option>
                    {incubatorRows.map((incubator: any) => <option key={incubator.id} value={incubator.id}>{incubator.name}</option>)}
                  </select>
                </Field>
                <Field label="MAC Address" htmlFor="mac_address">
                  <input id="mac_address" name="mac_address" className={inputClass} />
                </Field>
                <Field label="Firmware" htmlFor="firmware_version">
                  <input id="firmware_version" name="firmware_version" className={inputClass} />
                </Field>
              </div>
            </Section>
          </form>

          <Section icon={Thermometer} title="Registered Sensors" description="Live ingestion can start after hardware sends readings to the API.">
            <div className="space-y-3">
              {deviceRows.length === 0 ? (
                <EmptyState message="No sensors registered yet." />
              ) : (
                deviceRows.map((device: any) => {
                  const assignment = assignmentByDevice.get(device.id) as any
                  const incubatorName = readRelatedName(assignment?.incubators, 'name')
                  return (
                    <form key={device.id} action={updateDeviceStatus} className="rounded-button border border-border bg-muted/10 p-3">
                      <input type="hidden" name="device_id" value={device.id} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{device.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatLabel(device.device_type)} / {device.serial_number}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {incubatorName ? `Assigned to ${incubatorName}` : 'Unassigned'}
                          </p>
                        </div>
                        <Button type="submit" variant="outline" className="h-8 px-3 text-xs">Update</Button>
                      </div>
                      <select name="status" defaultValue={device.status || 'OFFLINE'} className={`${inputClass} mt-3`}>
                        {DEVICE_STATUSES.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
                      </select>
                    </form>
                  )
                })
              )}
            </div>
          </Section>

          <form action={saveCurrentUserProfileAndRole}>
            <Section
              icon={Users}
              title="Current Account & Role"
              description="This deployment has controlled login. Manage the active account role here."
              action={<SaveButton />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First Name" htmlFor="first_name">
                  <input id="first_name" name="first_name" defaultValue={profile?.first_name || ''} className={inputClass} />
                </Field>
                <Field label="Last Name" htmlFor="last_name">
                  <input id="last_name" name="last_name" defaultValue={profile?.last_name || ''} className={inputClass} />
                </Field>
                <Field label="Phone" htmlFor="phone">
                  <input id="phone" name="phone" defaultValue={profile?.phone || ''} className={inputClass} />
                </Field>
                <Field label="Role" htmlFor="role_code">
                  <select id="role_code" name="role_code" defaultValue={selectedRole} className={inputClass}>
                    <option value="MANAGER">Manager</option>
                    <option value="OPERATOR">Operator</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </Field>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric icon={Users} label="Accounts" value={Number(profileCount || 0).toLocaleString()} helper={user?.email || 'Current login'} />
                <Metric icon={Lock} label="Signup" value="Closed" helper="No public account creation" />
                <Metric icon={Shield} label="RLS" value="Enabled" helper="Authenticated access only" />
              </div>
            </Section>
          </form>

          <form action={inviteStaffMember}>
            <Section
              icon={Users}
              title="Invite Staff"
              description="Creates a Supabase login invite, staff profile, and role assignment."
              action={<SaveButton label="Invite" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" htmlFor="staff_email" className="sm:col-span-2">
                  <input id="staff_email" name="email" type="email" required className={inputClass} />
                </Field>
                <Field label="First Name" htmlFor="staff_first_name">
                  <input id="staff_first_name" name="first_name" className={inputClass} />
                </Field>
                <Field label="Last Name" htmlFor="staff_last_name">
                  <input id="staff_last_name" name="last_name" className={inputClass} />
                </Field>
                <Field label="Phone" htmlFor="staff_phone">
                  <input id="staff_phone" name="phone" className={inputClass} />
                </Field>
                <Field label="Role" htmlFor="staff_role_code">
                  <select id="staff_role_code" name="role_code" defaultValue="OPERATOR" className={inputClass}>
                    <option value="MANAGER">Manager</option>
                    <option value="OPERATOR">Operator</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </Field>
              </div>
              <p className="mt-3 rounded-button border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
                Requires `SUPABASE_SERVICE_ROLE_KEY` on the server. Without it, Supabase Auth cannot create or invite login accounts.
              </p>
            </Section>
          </form>
        </div>
      </div>
    </div>
  )
}

const inputClass = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30'
const textareaClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30'

function Section({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-button bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  )
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon
  label: string
  value: string
  helper: string
}) {
  return (
    <div className="rounded-button border border-border bg-muted/10 p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-button bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold text-foreground">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{helper}</p>
    </div>
  )
}

function SaveButton({ label = 'Save' }: { label?: string }) {
  return (
    <Button type="submit" className="h-9 gap-2 rounded-md px-4 font-medium shadow-sm">
      <Save className="h-4 w-4" />
      {label}
    </Button>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-button border border-dashed border-border bg-muted/10 px-3 py-5 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function readRelatedName(value: any, key: string) {
  if (!value) return null
  if (Array.isArray(value)) return value[0]?.[key] || null
  return value[key] || null
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}
