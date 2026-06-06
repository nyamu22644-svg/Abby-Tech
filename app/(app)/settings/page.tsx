import { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Database,
  Lock,
  Monitor,
  RadioTower,
  ReceiptText,
  Save,
  Shield,
  Sprout,
  Syringe,
  Thermometer,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { RegisterIncubatorDialog } from '../incubation/components/register-incubator-dialog'
import {
  registerSensorDevice,
  inviteStaffMember,
  saveBreedCatalog,
  saveBusinessSettings,
  saveCostRules,
  saveCurrentUserProfileAndRole,
  saveOrderSettings,
  saveReceiptBranding,
  saveVaccinationSchedule,
  updateDeviceStatus,
  updateIncubatorStatus,
} from './actions'

export const metadata: Metadata = {
  title: 'Settings | Smart Hatchery OS',
  description: 'Configure facility, equipment, sensors, receipts, breeds, and access.',
}

type SettingsPageProps = {
  searchParams?: Promise<{ saved?: string; error?: string; section?: string }>
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
const SETTINGS_SECTIONS = [
  { key: 'business', label: 'Business & Receipt', icon: Monitor, group: 'daily', tone: 'primary' },
  { key: 'production', label: 'Batch & Chick Defaults', icon: Sprout, group: 'daily', tone: 'success' },
  { key: 'costs', label: 'Daily Costs', icon: Calculator, group: 'daily', tone: 'primary' },
  { key: 'vaccinations', label: 'Vaccination Costs', icon: Syringe, group: 'daily', tone: 'warning' },
  { key: 'orders', label: 'Orders & Reservations', icon: ClipboardList, group: 'daily', tone: 'primary' },
  { key: 'equipment', label: 'Equipment', icon: Thermometer, group: 'advanced', tone: 'warning' },
  { key: 'sensors', label: 'Sensors / IoT', icon: RadioTower, group: 'advanced', tone: 'primary' },
  { key: 'access', label: 'Staff Access', icon: Users, group: 'advanced', tone: 'success' },
  { key: 'system', label: 'System Health', icon: Database, group: 'advanced', tone: 'success' },
] as const

type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]['key']
type ActiveSettingsSectionKey = SettingsSectionKey | 'home'
type SettingTone = (typeof SETTINGS_SECTIONS)[number]['tone']

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

  const facilityName = settings?.business_name || tenant?.name || 'Abbye Chicks Hatchery'
  const timezone = settings?.timezone || tenant?.timezone || 'Africa/Nairobi'
  const currencyCode = settings?.currency_code || tenant?.currency_code || 'KES'
  const incubationDays = settings?.default_incubation_days ?? 21
  const hatchRateTarget = settings?.default_hatch_rate_target ?? 85
  const chickPrice = settings?.default_chick_price ?? 130
  const reservationExpiryDays = settings?.reservation_expiry_days ?? 3
  const alertsEnabled = settings?.alerts_enabled ?? true
  const activeSection: ActiveSettingsSectionKey = SETTINGS_SECTIONS.some((section) => section.key === params.section)
    ? (params.section as SettingsSectionKey)
    : 'home'
  const breedOptions = Array.isArray(settings?.breed_options) && settings.breed_options.length > 0
    ? settings.breed_options
    : DEFAULT_BREEDS
  const vaccinationRules = Array.isArray(settings?.required_vaccination_rules) ? settings.required_vaccination_rules : []
  const vaccinationRulesText = vaccinationRules
    .map((rule: any) => `${rule.name || ''} | ${rule.due_day ?? 0} | ${rule.cost_per_chick ?? 0} | ${rule.required === false ? 'optional' : 'required'}`)
    .join('\n')
  const costRules = {
    electricityCostPerUnit: settings?.electricity_cost_per_unit ?? 25,
    incubatorUnitsPerDay: settings?.incubator_units_per_day ?? 10,
    brooderUnitsPerDay: settings?.brooder_units_per_day ?? 4,
    hatcheryLaborCostPerDay: settings?.hatchery_labor_cost_per_day ?? 0,
    generatorFuelCostPerDay: settings?.generator_fuel_cost_per_day ?? 0,
    brooderLaborCostPerDay: settings?.brooder_labor_cost_per_day ?? 0,
    starterFeedPricePerKg: settings?.starter_feed_price_per_kg ?? 80,
    starterFeedGramsPerChickDay: settings?.starter_feed_grams_per_chick_day ?? 15,
    growerFeedPricePerKg: settings?.grower_feed_price_per_kg ?? 80,
    growerFeedGramsPerChickDay: settings?.grower_feed_grams_per_chick_day ?? 35,
    growerFeedStartsDay: settings?.grower_feed_starts_day ?? 8,
    holdingOverheadCostPerDay: settings?.holding_overhead_cost_per_day ?? 0,
    targetProfitMarginPercent: settings?.target_profit_margin_percent ?? 25,
  }
  const operatingDataCount = Number(batchCount || 0) + Number(customerCount || 0) + Number(orderCount || 0)

  const readiness = [
    {
      label: 'Business profile',
      complete: Boolean(settings?.id),
      helper: settings?.id ? 'Saved and ready' : 'Needs business details',
    },
    {
      label: 'Incubator equipment',
      complete: incubatorRows.length > 0,
      helper: incubatorRows.length > 0 ? `${incubatorRows.length.toLocaleString()} registered` : 'Register the real machine',
    },
    {
      label: 'Live records active',
      complete: true,
      helper: operatingDataCount === 0
        ? 'No live records yet'
        : `${operatingDataCount.toLocaleString()} records safely in use`,
    },
    {
      label: 'Current account',
      complete: Boolean(profile?.primary_role_id),
      helper: profile?.primary_role_id ? 'Role assigned' : 'Assign role below',
    },
  ]
  const assignedDeviceCount = Array.from(assignmentByDevice.values()).filter(Boolean).length
  const activeSectionSummary: Record<SettingsSectionKey, Array<{ label: string; value: string }>> = {
    business: [
      { label: 'Farm name', value: facilityName },
      { label: 'Currency', value: currencyCode },
      { label: 'Timezone', value: timezone },
      { label: 'Receipt header', value: settings?.receipt_title || facilityName || 'Not set' },
    ],
    production: [
      { label: 'Incubation days', value: `${Number(incubationDays || 0).toLocaleString()} days` },
      { label: 'Hatch target', value: `${Number(hatchRateTarget || 0).toLocaleString()}%` },
      { label: 'Chick price', value: `${currencyCode} ${Number(chickPrice || 0).toLocaleString()}` },
      { label: 'Breeds saved', value: breedOptions.length.toLocaleString() },
    ],
    costs: [
      { label: 'Electricity unit', value: `${currencyCode} ${Number(costRules.electricityCostPerUnit || 0).toLocaleString()}` },
      { label: 'Incubator daily units', value: Number(costRules.incubatorUnitsPerDay || 0).toLocaleString() },
      { label: 'Brooder daily units', value: Number(costRules.brooderUnitsPerDay || 0).toLocaleString() },
      { label: 'Target Profit Margin', value: `${Number(costRules.targetProfitMarginPercent || 0).toLocaleString()}%` },
    ],
    vaccinations: [
      { label: 'Vaccines saved', value: vaccinationRules.length.toLocaleString() },
      { label: 'Costing status', value: vaccinationRules.length > 0 ? 'Used in batch cost' : 'No vaccine costs yet' },
    ],
    orders: [
      { label: 'Default price', value: `${currencyCode} ${Number(chickPrice || 0).toLocaleString()}` },
      { label: 'Alerts', value: alertsEnabled ? 'On' : 'Off' },
      { label: 'Release unpaid holds', value: `${Number(reservationExpiryDays || 0).toLocaleString()} days` },
      { label: 'Orders saved', value: Number(orderCount || 0).toLocaleString() },
    ],
    equipment: [
      { label: 'Incubators', value: incubatorRows.length.toLocaleString() },
      { label: 'Status', value: incubatorRows.length > 0 ? 'Equipment registered' : 'No equipment yet' },
    ],
    sensors: [
      { label: 'Devices', value: deviceRows.length.toLocaleString() },
      { label: 'Assigned devices', value: assignedDeviceCount.toLocaleString() },
    ],
    access: [
      { label: 'Accounts', value: Number(profileCount || 0).toLocaleString() },
      { label: 'Current role', value: selectedRole },
      { label: 'Current login', value: user?.email || 'Not available' },
    ],
    system: [
      { label: 'Live records', value: operatingDataCount.toLocaleString() },
      { label: 'Incubators', value: incubatorRows.length.toLocaleString() },
      { label: 'Account role', value: profile?.primary_role_id ? 'Assigned' : 'Needs role' },
    ],
  }

  return (
    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="mt-0.5 max-w-2xl text-[13px] text-muted-foreground">
            Choose the task you want to update. Daily work is separated from less frequent setup.
          </p>
        </div>
        <Button render={<Link href="/incubation" />} nativeButton={false} variant="outline" className="h-9 rounded-button">
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

      {activeSection === 'home' ? (
        <SettingsHome
          facilityName={facilityName}
          incubatorCount={incubatorRows.length}
          deviceCount={deviceRows.length}
          profileCount={Number(profileCount || 0)}
          operatingDataCount={operatingDataCount}
          currencyCode={currencyCode}
          chickPrice={Number(chickPrice || 0)}
        />
      ) : (
        <SettingsSectionHeader
          activeSection={activeSection}
          summary={activeSectionSummary[activeSection]}
        />
      )}

      {activeSection === 'business' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <form action={saveBusinessSettings}>
            <Section
              icon={Monitor}
              tone="primary"
              title="Business & Receipt"
              description="Farm name, receipt details, currency, timezone, and alerts."
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
                <input type="hidden" name="default_incubation_days" value={incubationDays} />
                <input type="hidden" name="default_hatch_rate_target" value={hatchRateTarget} />
                <input type="hidden" name="default_chick_price" value={chickPrice} />
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
              tone="primary"
              title="Receipt Details"
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
        </div>
      ) : null}

      {activeSection === 'production' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <form action={saveBusinessSettings}>
            <Section
              icon={Sprout}
              tone="success"
              title="Batch & Chick Defaults"
              description="Default hatch days, hatch target, chick price, and alerts."
              action={<SaveButton />}
            >
              <input type="hidden" name="business_name" value={facilityName} />
              <input type="hidden" name="timezone" value={timezone} />
              <input type="hidden" name="currency_code" value={currencyCode} />
              <div className="grid gap-4 sm:grid-cols-2">
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

          <form action={saveBreedCatalog}>
            <Section
              icon={Sprout}
              tone="success"
              title="Breed List"
              description="These options guide batch intake and customer order breed requests."
              action={<SaveButton />}
            >
              <Field label="One breed per line" htmlFor="breed_options">
                <textarea id="breed_options" name="breed_options" rows={8} defaultValue={breedOptions.join('\n')} className={textareaClass} />
              </Field>
            </Section>
          </form>
        </div>
      ) : null}

      {activeSection === 'costs' ? (
        <form action={saveCostRules}>
          <Section
            icon={Calculator}
            tone="primary"
            title="Daily Costs"
            description="Costs the system adds automatically when estimating batch cost."
            action={<SaveButton />}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Electricity Cost Per Unit" htmlFor="electricity_cost_per_unit" helper="Use the unit shown on the token or bill.">
                <input id="electricity_cost_per_unit" name="electricity_cost_per_unit" type="number" required min="0" step="0.01" defaultValue={costRules.electricityCostPerUnit} className={inputClass} />
              </Field>
              <Field label="Incubator electricity units per day" htmlFor="incubator_units_per_day">
                <input id="incubator_units_per_day" name="incubator_units_per_day" type="number" required min="0" step="0.01" defaultValue={costRules.incubatorUnitsPerDay} className={inputClass} />
              </Field>
              <Field label="Brooder electricity units per day" htmlFor="brooder_units_per_day">
                <input id="brooder_units_per_day" name="brooder_units_per_day" type="number" required min="0" step="0.01" defaultValue={costRules.brooderUnitsPerDay} className={inputClass} />
              </Field>
              <Field label="Staff cost during incubation per day" htmlFor="hatchery_labor_cost_per_day">
                <input id="hatchery_labor_cost_per_day" name="hatchery_labor_cost_per_day" type="number" required min="0" step="0.01" defaultValue={costRules.hatcheryLaborCostPerDay} className={inputClass} />
              </Field>
              <Field label="Generator / fuel cost per day" htmlFor="generator_fuel_cost_per_day">
                <input id="generator_fuel_cost_per_day" name="generator_fuel_cost_per_day" type="number" required min="0" step="0.01" defaultValue={costRules.generatorFuelCostPerDay} className={inputClass} />
              </Field>
              <Field label="Staff cost during brooding per day" htmlFor="brooder_labor_cost_per_day">
                <input id="brooder_labor_cost_per_day" name="brooder_labor_cost_per_day" type="number" required min="0" step="0.01" defaultValue={costRules.brooderLaborCostPerDay} className={inputClass} />
              </Field>
              <Field label="Starter feed price per kg" htmlFor="starter_feed_price_per_kg">
                <input id="starter_feed_price_per_kg" name="starter_feed_price_per_kg" type="number" required min="0" step="0.01" defaultValue={costRules.starterFeedPricePerKg} className={inputClass} />
              </Field>
              <Field label="Starter feed eaten per chick per day" htmlFor="starter_feed_grams_per_chick_day">
                <input id="starter_feed_grams_per_chick_day" name="starter_feed_grams_per_chick_day" type="number" required min="0" step="0.01" defaultValue={costRules.starterFeedGramsPerChickDay} className={inputClass} />
              </Field>
              <Field label="Grower feed starts on day" htmlFor="grower_feed_starts_day">
                <input id="grower_feed_starts_day" name="grower_feed_starts_day" type="number" required min="1" step="1" defaultValue={costRules.growerFeedStartsDay} className={inputClass} />
              </Field>
              <Field label="Grower feed price per kg" htmlFor="grower_feed_price_per_kg">
                <input id="grower_feed_price_per_kg" name="grower_feed_price_per_kg" type="number" required min="0" step="0.01" defaultValue={costRules.growerFeedPricePerKg} className={inputClass} />
              </Field>
              <Field label="Grower feed eaten per chick per day" htmlFor="grower_feed_grams_per_chick_day">
                <input id="grower_feed_grams_per_chick_day" name="grower_feed_grams_per_chick_day" type="number" required min="0" step="0.01" defaultValue={costRules.growerFeedGramsPerChickDay} className={inputClass} />
              </Field>
              <Field label="Other holding cost per day" htmlFor="holding_overhead_cost_per_day">
                <input id="holding_overhead_cost_per_day" name="holding_overhead_cost_per_day" type="number" required min="0" step="0.01" defaultValue={costRules.holdingOverheadCostPerDay} className={inputClass} />
              </Field>
              <Field label="Target Profit Margin (%)" htmlFor="target_profit_margin_percent" helper="Profit to add on top of cost.">
                <input id="target_profit_margin_percent" name="target_profit_margin_percent" type="number" required min="0" step="0.01" defaultValue={costRules.targetProfitMarginPercent} className={inputClass} />
              </Field>
            </div>
          </Section>
        </form>
      ) : null}

      {activeSection === 'vaccinations' ? (
        <form action={saveVaccinationSchedule}>
          <Section
            icon={Syringe}
            tone="warning"
            title="Vaccination Costs"
            description="Vaccines and cost per chick for automatic batch costing."
            action={<SaveButton />}
          >
            <Field
              label="One vaccine cost per line"
              htmlFor="required_vaccination_rules"
              helper="Format: Vaccine name | day after hatch | cost per chick | required or optional"
            >
              <textarea
                id="required_vaccination_rules"
                name="required_vaccination_rules"
                rows={8}
                defaultValue={vaccinationRulesText}
                placeholder="Marek | 0 | 5 | required&#10;Newcastle | 7 | 3 | required"
                className={textareaClass}
              />
            </Field>
          </Section>
        </form>
      ) : null}

      {activeSection === 'equipment' ? (
        <Section
          icon={Monitor}
          tone="warning"
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
      ) : null}

      {activeSection === 'sensors' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <form action={registerSensorDevice}>
            <Section
              icon={RadioTower}
              tone="primary"
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

          <Section icon={Thermometer} tone="primary" title="Registered Sensors" description="Live ingestion can start after hardware sends readings to the API.">
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
        </div>
      ) : null}

      {activeSection === 'orders' ? (
        <form action={saveOrderSettings}>
          <Section
            icon={ClipboardList}
            tone="primary"
            title="Orders & Reservations"
            description="Follow-up defaults and release timing for unpaid reserved stock."
            action={<SaveButton />}
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Release unpaid holds after"
                  htmlFor="reservation_expiry_days"
                  helper="If payment is still pending after this many days, reserved stock is released automatically. Use 0 to release the same day."
                >
                  <input
                    id="reservation_expiry_days"
                    name="reservation_expiry_days"
                    type="number"
                    required
                    min="0"
                    max="365"
                    step="1"
                    defaultValue={reservationExpiryDays}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <Metric icon={ClipboardList} label="Default Price" value={`${currencyCode} ${Number(chickPrice || 0).toLocaleString()}`} helper="Used when a new order has no custom price." />
                <Metric icon={CheckCircle2} label="Alerts" value={alertsEnabled ? 'On' : 'Off'} helper="Order follow-up alerts use this setting." />
                <Metric icon={Database} label="Orders" value={Number(orderCount || 0).toLocaleString()} helper="Existing order records remain unchanged." />
              </div>
            </div>
          </Section>
        </form>
      ) : null}

      {activeSection === 'system' ? (
        <Section
          icon={Database}
          tone="success"
          title="System Health"
          description="A simple check that the main setup items are ready."
        >
          <div className="grid gap-3 md:grid-cols-4">
            {readiness.map((item) => (
              <HealthCheck key={item.label} label={item.label} helper={item.helper} complete={item.complete} />
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric icon={Sprout} label="Batches" value={Number(batchCount || 0).toLocaleString()} helper="Saved egg batch records" />
            <Metric icon={Users} label="Customers" value={Number(customerCount || 0).toLocaleString()} helper="Saved customer records" />
            <Metric icon={ClipboardList} label="Orders" value={Number(orderCount || 0).toLocaleString()} helper="Saved order records" />
          </div>
        </Section>
      ) : null}

      {activeSection === 'access' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <form action={saveCurrentUserProfileAndRole}>
            <Section
              icon={Users}
              tone="success"
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
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Metric icon={Users} label="Accounts" value={Number(profileCount || 0).toLocaleString()} helper={user?.email || 'Current login'} />
                <Metric icon={Lock} label="Signup" value="Closed" helper="No public account creation" />
                <Metric icon={Shield} label="RLS" value="Enabled" helper="Authenticated access only" />
              </div>
            </Section>
          </form>

          <form action={inviteStaffMember}>
            <Section
              icon={Users}
              tone="success"
              title="Invite Staff"
              description="Sends a Supabase invite so the staff member can create a private password."
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
                The email link opens a password setup screen. Staff should create their own password, not use the manager password.
              </p>
            </Section>
          </form>
        </div>
      ) : null}
    </div>
  )
}

const inputClass = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30'
const textareaClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30'

function SettingsHome({
  facilityName,
  incubatorCount,
  deviceCount,
  profileCount,
  operatingDataCount,
  currencyCode,
  chickPrice,
}: {
  facilityName: string
  incubatorCount: number
  deviceCount: number
  profileCount: number
  operatingDataCount: number
  currencyCode: string
  chickPrice: number
}) {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border bg-muted/10 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Settings Home</p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-foreground">{facilityName}</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
              Start with the task you want to update. Less frequent setup is separated below.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
            <MiniStat label="Chick price" value={`${currencyCode} ${chickPrice.toLocaleString()}`} />
            <MiniStat label="Equipment" value={`${incubatorCount.toLocaleString()} incubator${incubatorCount === 1 ? '' : 's'}`} />
            <MiniStat label="Live records" value={operatingDataCount.toLocaleString()} />
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <TaskCard icon={Calculator} tone="primary" href="/settings?section=costs" title="Set daily costs" description="Electricity units, staff cost, fuel, feed, and margin." />
            <TaskCard icon={Syringe} tone="warning" href="/settings?section=vaccinations" title="Set vaccination costs" description="Vaccines, due day, and cost per chick." />
            <TaskCard icon={Sprout} tone="success" href="/settings?section=production" title="Update chick defaults" description="Hatch days, target hatch rate, chick price, and breeds." />
            <TaskCard icon={ClipboardList} tone="primary" href="/settings?section=orders" title="Review order defaults" description="Order price, alerts, and reservation automation notes." />
            <TaskCard icon={ReceiptText} tone="primary" href="/settings?section=business" title="Receipt details" description="Farm name, receipt phone, location, and footer note." />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/10 px-5 py-3.5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Occasional Setup</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Items that are changed less often during normal work.</p>
        </div>
        <div className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
          <TaskCard icon={Users} tone="success" href="/settings?section=access" title="Staff access" description={`${profileCount.toLocaleString()} account${profileCount === 1 ? '' : 's'} in the system.`} />
          <TaskCard icon={Thermometer} tone="warning" href="/settings?section=equipment" title="Equipment setup" description={`${incubatorCount.toLocaleString()} incubator${incubatorCount === 1 ? '' : 's'} registered.`} />
          <TaskCard icon={RadioTower} tone="primary" href="/settings?section=sensors" title="Sensors / IoT" description={`${deviceCount.toLocaleString()} device${deviceCount === 1 ? '' : 's'} registered.`} />
          <TaskCard icon={Database} tone="success" href="/settings?section=system" title="System health" description="Setup checks and live record counts." />
        </div>
      </Card>
    </div>
  )
}

function SettingsSectionHeader({
  activeSection,
  summary,
}: {
  activeSection: SettingsSectionKey
  summary: Array<{ label: string; value: string }>
}) {
  const section = SETTINGS_SECTIONS.find((item) => item.key === activeSection)
  const Icon = section?.icon || Monitor
  const tone = getToneStyles(section?.tone || 'primary')

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border bg-muted/10 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tone.solidIcon)}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{section?.label || 'Settings'}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Current saved settings are shown before editing.</p>
          </div>
        </div>
        <Button render={<Link href="/settings" />} nativeButton={false} variant="outline" className="h-8 w-fit rounded-button px-3 text-xs">
          Back to Settings Home
        </Button>
      </div>
      <div className="grid gap-2 px-5 py-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((item) => (
          <MiniStat key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </Card>
  )
}

function TaskCard({
  icon: Icon,
  tone,
  href,
  title,
  description,
}: {
  icon: LucideIcon
  tone: SettingTone
  href: string
  title: string
  description: string
}) {
  const toneStyles = getToneStyles(tone)

  return (
    <Link
      href={href}
      className={cn(
        'group flex min-h-28 gap-3 rounded-button border bg-card p-3.5 transition-colors hover:bg-muted/30',
        toneStyles.cardBorder,
        toneStyles.cardHover
      )}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors', toneStyles.softIcon, toneStyles.groupIcon)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-tight text-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </Link>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-button border border-border bg-muted/10 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function getToneStyles(tone: SettingTone) {
  return {
    primary: {
      solidIcon: 'bg-primary text-primary-foreground shadow-[0_12px_24px_rgba(37,99,235,0.24)]',
      softIcon: 'bg-primary/10 text-primary',
      groupIcon: 'group-hover:bg-primary group-hover:text-primary-foreground',
      cardBorder: 'border-primary/25',
      cardHover: 'hover:border-primary/45',
      leftBorder: 'border-l-primary',
    },
    success: {
      solidIcon: 'bg-success text-white shadow-[0_12px_24px_rgba(45,212,111,0.20)]',
      softIcon: 'bg-success/10 text-success',
      groupIcon: 'group-hover:bg-success group-hover:text-white',
      cardBorder: 'border-success/25',
      cardHover: 'hover:border-success/45',
      leftBorder: 'border-l-success',
    },
    warning: {
      solidIcon: 'bg-warning text-slate-950 shadow-[0_12px_24px_rgba(251,191,36,0.20)]',
      softIcon: 'bg-warning/10 text-warning',
      groupIcon: 'group-hover:bg-warning group-hover:text-slate-950',
      cardBorder: 'border-warning/25',
      cardHover: 'hover:border-warning/45',
      leftBorder: 'border-l-warning',
    },
  }[tone]
}

function Section({
  icon: Icon,
  tone = 'primary',
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon
  tone?: SettingTone
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
}) {
  const toneStyles = getToneStyles(tone)

  return (
    <Card className={cn('overflow-hidden border-l-4', toneStyles.leftBorder)}>
      <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', toneStyles.softIcon)}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </Card>
  )
}

function Field({
  label,
  htmlFor,
  helper,
  className,
  children,
}: {
  label: string
  htmlFor: string
  helper?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {helper ? <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{helper}</p> : null}
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
    <div className="min-w-0 overflow-hidden rounded-button border border-border bg-muted/10 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-button bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold text-foreground">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{helper}</p>
    </div>
  )
}

function HealthCheck({ label, helper, complete }: { label: string; helper: string; complete: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-button border border-border bg-muted/10 p-3">
      <span className="mt-0.5">
        {complete ? (
          <CheckCircle2 className="h-5 w-5 text-success" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-warning" />
        )}
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
      </div>
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
