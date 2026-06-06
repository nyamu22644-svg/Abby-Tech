export type CostRules = {
  electricityCostPerUnit: number
  incubatorUnitsPerDay: number
  brooderUnitsPerDay: number
  hatcheryLaborCostPerDay: number
  generatorFuelCostPerDay: number
  brooderLaborCostPerDay: number
  starterFeedPricePerKg: number
  starterFeedGramsPerChickDay: number
  growerFeedPricePerKg: number
  growerFeedGramsPerChickDay: number
  growerFeedStartsDay: number
  holdingOverheadCostPerDay: number
  targetProfitMarginPercent: number
  vaccinationRules: VaccinationRule[]
}

export type VaccinationRule = {
  name: string
  due_day: number
  cost_per_chick: number
  required?: boolean
}

export type BatchCostInput = {
  total_initial_cost?: number | null
  set_date?: string | null
  expected_hatch_date?: string | null
  actual_hatch_date?: string | null
  quantity_received?: number | null
  quantity_set?: number | null
  accepted_eggs?: number | null
  quantity_hatched?: number | null
  quantity_culled?: number | null
  mortality_count?: number | null
  status?: string | null
}

export type BatchCostSnapshot = {
  initialCost: number
  manualCostTotal: number
  incubationRunningCost: number
  holdingRunningCost: number
  feedCost: number
  vaccinationCost: number
  totalCost: number
  costQuantity: number
  costPerChick: number
  suggestedMinimumPrice: number
  incubationDays: number
  holdingDays: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function readCostRules(settings: any): CostRules {
  return {
    electricityCostPerUnit: readNumber(settings?.electricity_cost_per_unit, 25),
    incubatorUnitsPerDay: readNumber(settings?.incubator_units_per_day, 10),
    brooderUnitsPerDay: readNumber(settings?.brooder_units_per_day, 4),
    hatcheryLaborCostPerDay: readNumber(settings?.hatchery_labor_cost_per_day, 0),
    generatorFuelCostPerDay: readNumber(settings?.generator_fuel_cost_per_day, 0),
    brooderLaborCostPerDay: readNumber(settings?.brooder_labor_cost_per_day, 0),
    starterFeedPricePerKg: readNumber(settings?.starter_feed_price_per_kg, 80),
    starterFeedGramsPerChickDay: readNumber(settings?.starter_feed_grams_per_chick_day, 15),
    growerFeedPricePerKg: readNumber(settings?.grower_feed_price_per_kg, 80),
    growerFeedGramsPerChickDay: readNumber(settings?.grower_feed_grams_per_chick_day, 35),
    growerFeedStartsDay: Math.max(1, Math.round(readNumber(settings?.grower_feed_starts_day, 8))),
    holdingOverheadCostPerDay: readNumber(settings?.holding_overhead_cost_per_day, 0),
    targetProfitMarginPercent: readNumber(settings?.target_profit_margin_percent, 25),
    vaccinationRules: normalizeVaccinationRules(settings?.required_vaccination_rules),
  }
}

export function calculateBatchCostSnapshot(
  batch: BatchCostInput,
  manualCostTotal = 0,
  settings: any = {},
  now = new Date()
): BatchCostSnapshot {
  const rules = readCostRules(settings)
  const initialCost = readNumber(batch.total_initial_cost, 0)
  const incubationDays = getIncubationDays(batch, now)
  const holdingDays = getHoldingDays(batch.actual_hatch_date, now)
  const hasHatched = hasHatchResult(batch)
  const chickCount = getCostQuantity(batch)
  const incubationRunningCost = incubationDays * (
    rules.electricityCostPerUnit * rules.incubatorUnitsPerDay +
    rules.hatcheryLaborCostPerDay +
    rules.generatorFuelCostPerDay
  )
  const brooderDailyCost = rules.electricityCostPerUnit * rules.brooderUnitsPerDay +
    rules.brooderLaborCostPerDay +
    rules.holdingOverheadCostPerDay
  const holdingRunningCost = holdingDays * brooderDailyCost
  const feedCost = calculateFeedCost(chickCount, holdingDays, rules)
  const vaccinationCost = calculateVaccinationCost(chickCount, holdingDays, rules, hasHatched)
  const totalCost = initialCost +
    readNumber(manualCostTotal, 0) +
    incubationRunningCost +
    holdingRunningCost +
    feedCost +
    vaccinationCost
  const costPerChick = chickCount > 0 ? totalCost / chickCount : 0
  const suggestedMinimumPrice = costPerChick * (1 + rules.targetProfitMarginPercent / 100)

  return {
    initialCost,
    manualCostTotal: readNumber(manualCostTotal, 0),
    incubationRunningCost,
    holdingRunningCost,
    feedCost,
    vaccinationCost,
    totalCost,
    costQuantity: chickCount,
    costPerChick,
    suggestedMinimumPrice,
    incubationDays,
    holdingDays,
  }
}

function calculateFeedCost(chickCount: number, holdingDays: number, rules: CostRules) {
  if (chickCount <= 0 || holdingDays <= 0) return 0

  let total = 0
  let remainingDays = holdingDays
  for (let day = 1; remainingDays > 0; day += 1) {
    const dayPortion = Math.min(1, remainingDays)
    const isGrower = day >= rules.growerFeedStartsDay
    const grams = isGrower ? rules.growerFeedGramsPerChickDay : rules.starterFeedGramsPerChickDay
    const price = isGrower ? rules.growerFeedPricePerKg : rules.starterFeedPricePerKg
    total += chickCount * (grams / 1000) * price * dayPortion
    remainingDays -= dayPortion
  }
  return total
}

function calculateVaccinationCost(chickCount: number, holdingDays: number, rules: CostRules, hasHatched: boolean) {
  if (chickCount <= 0 || !hasHatched) return 0

  return rules.vaccinationRules
    .filter((rule) => rule.required !== false && rule.due_day <= holdingDays)
    .reduce((total, rule) => total + chickCount * readNumber(rule.cost_per_chick, 0), 0)
}

function hasHatchResult(batch: BatchCostInput) {
  return Boolean(
    parseDate(batch.actual_hatch_date) ||
      readNumber(batch.quantity_hatched, 0) > 0 ||
      ['COMPLETED', 'BROODER'].includes(batch.status || '')
  )
}

function getIncubationDays(batch: BatchCostInput, now: Date) {
  if (!batch.set_date) return 0

  const setDate = parseDate(batch.set_date)
  if (!setDate) return 0

  const hatchDate = parseDate(batch.actual_hatch_date)
  const expectedHatchDate = parseDate(batch.expected_hatch_date)
  const endDate = hatchDate || (expectedHatchDate && expectedHatchDate < now ? expectedHatchDate : now)
  return daysBetween(setDate, endDate)
}

function getHoldingDays(actualHatchDate?: string | null, now = new Date()) {
  const hatchDate = parseDate(actualHatchDate)
  return hatchDate ? daysBetween(hatchDate, now) : 0
}

function getCostQuantity(batch: BatchCostInput) {
  const hatched = readNumber(batch.quantity_hatched, 0)
  if (hatched > 0) return Math.max(0, hatched - readNumber(batch.mortality_count, 0))

  const setQuantity = readNumber(batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received, 0)
  return Math.max(0, setQuantity - readNumber(batch.quantity_culled, 0) - readNumber(batch.mortality_count, 0))
}

function normalizeVaccinationRules(value: any): VaccinationRule[] {
  if (!Array.isArray(value)) return []

  return value
    .map((rule) => ({
      name: String(rule?.name || '').trim(),
      due_day: Math.max(0, Math.round(readNumber(rule?.due_day, 0))),
      cost_per_chick: readNumber(rule?.cost_per_chick, 0),
      required: rule?.required !== false,
    }))
    .filter((rule) => rule.name && rule.cost_per_chick >= 0)
}

function daysBetween(start: Date, end: Date) {
  const elapsedDays = (end.getTime() - start.getTime()) / MS_PER_DAY
  return Math.max(0, Math.round(elapsedDays * 100) / 100)
}

function parseDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function readNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}
