const EXPIRED_HOLD_NOTE = 'Auto release: unpaid stock hold expired after the saved reservation window.'
const PAYMENT_FOLLOW_UP_AFTER_DAYS = 2
const DEFAULT_RESERVATION_EXPIRY_DAYS = 3

type AutomationResult = {
  releasedHolds: number
  retriedAllocations: number
  promotedReadyOrders: number
  learnedPreferences: number
}

type BatchAvailabilityCandidate = {
  id: string
  batch_number: string
  breed_type?: string | null
  status: string
  expected_hatch_date?: string | null
  baseQuantity: number
  allocatedCount: number
  available: number
}

export async function runOrderAutomation(db: any): Promise<AutomationResult> {
  const releasedHolds = await releaseExpiredUnpaidHolds(db)
  const retriedAllocations = await retryUnallocatedOrders(db)
  const promotedReadyOrders = await promotePaidAllocatedReadyOrders(db)
  const learnedPreferences = await learnCustomerPreferences(db)

  return {
    releasedHolds,
    retriedAllocations,
    promotedReadyOrders,
    learnedPreferences,
  }
}

export function isPaymentFollowUpDue(order: any, now = new Date()) {
  if (!order || ['DELIVERED', 'CANCELLED'].includes(order.status || '')) return false
  if (Number(order.balance_due || 0) <= 0) return false

  const requiredBy = order.required_by_date ? new Date(order.required_by_date) : null
  if (requiredBy && requiredBy.getTime() <= addDays(now, 2).getTime()) return true

  const createdAt = order.created_at ? new Date(order.created_at) : null
  if (!createdAt) return false
  return createdAt.getTime() <= addDays(now, -PAYMENT_FOLLOW_UP_AFTER_DAYS).getTime()
}

export function extractBreedFromDescription(description?: string | null) {
  const text = String(description || '')
  const [, breed] = text.split(' - ')
  return breed?.trim() || ''
}

async function releaseExpiredUnpaidHolds(db: any) {
  const expiryDays = await getReservationExpiryDays(db)
  const cutoffDate = toDateOnly(addDays(new Date(), -expiryDays))
  const today = new Date().toISOString().split('T')[0]
  const { data: expiredOrders } = await db
    .from('orders')
    .select('id, status, notes, created_at, required_by_date, order_items(id, batch_id, status)')
    .eq('payment_status', 'PENDING')
    .in('status', ['RESERVED', 'CONFIRMED', 'ALLOCATED'])
    .is('deleted_at', null)

  let released = 0

  for (const order of expiredOrders || []) {
    const createdDate = toDateOnly(new Date(order.created_at || new Date()))
    const targetDatePassed = order.required_by_date && order.required_by_date < today
    const reservationWindowPassed = createdDate <= cutoffDate
    if (!targetDatePassed && !reservationWindowPassed) continue

    const items = Array.isArray(order.order_items) ? order.order_items : []
    const hasStockHold = items.some((item: any) => item.batch_id && item.status !== 'CANCELLED')

    if (hasStockHold) {
      await db
        .from('order_items')
        .update({
          batch_id: null,
          status: 'UNALLOCATED',
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', order.id)
        .neq('status', 'CANCELLED')
    }

    const notes = appendAutomationNote(order.notes, EXPIRED_HOLD_NOTE)
    await db
      .from('orders')
      .update({
        status: 'INQUIRY',
        dispatch_status: 'PENDING',
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    released += hasStockHold ? 1 : 0
  }

  return released
}

async function getReservationExpiryDays(db: any) {
  const { data } = await db
    .from('business_settings')
    .select('reservation_expiry_days')
    .limit(1)
    .maybeSingle()

  const value = Number(data?.reservation_expiry_days ?? DEFAULT_RESERVATION_EXPIRY_DAYS)
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : DEFAULT_RESERVATION_EXPIRY_DAYS
}

function toDateOnly(value: Date) {
  return value.toISOString().split('T')[0]
}

async function retryUnallocatedOrders(db: any) {
  const today = new Date().toISOString().split('T')[0]
  const { data: orders } = await db
    .from('orders')
    .select(`
      id,
      status,
      payment_status,
      required_by_date,
      total_quantity,
      order_items (
        id,
        batch_id,
        description,
        quantity,
        status
      )
    `)
    .in('status', ['INQUIRY', 'RESERVED', 'CONFIRMED'])
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(100)

  const candidates = await getBatchAvailabilityCandidates(db)
  let allocated = 0

  for (const order of orders || []) {
    const items = Array.isArray(order.order_items) ? order.order_items : []
    if (items.some((item: any) => item.batch_id && item.status !== 'CANCELLED')) continue
    if (order.payment_status === 'PENDING' && order.required_by_date && order.required_by_date < today) continue

    const activeItems = items.filter((item: any) => item.status !== 'CANCELLED')
    const firstItem = activeItems[0]
    const quantity = Number(order.total_quantity || firstItem?.quantity || 0)
    if (quantity <= 0) continue

    const requestedBreed = extractBreedFromDescription(firstItem?.description)
    const batch = findBestBatch(candidates, quantity, order.required_by_date, requestedBreed)
    if (!batch) continue

    const readyNow = ['COMPLETED', 'BROODER'].includes(batch.status || '')
    const nextStatus = order.payment_status === 'PAID' && readyNow ? 'READY_FOR_DISPATCH' : 'ALLOCATED'

    await db
      .from('order_items')
      .update({
        batch_id: batch.id,
        status: 'ALLOCATED',
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', order.id)
      .neq('status', 'CANCELLED')

    await db
      .from('orders')
      .update({
        status: nextStatus,
        dispatch_status: nextStatus === 'READY_FOR_DISPATCH' ? 'SCHEDULED' : 'PENDING',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    batch.available = Math.max(0, batch.available - quantity)
    batch.allocatedCount += quantity
    allocated += 1
  }

  return allocated
}

async function promotePaidAllocatedReadyOrders(db: any) {
  const { data: orders } = await db
    .from('orders')
    .select(`
      id,
      order_items (
        batch_id,
        quantity,
        status,
        egg_batches(status, quantity_hatched, quantity_culled, mortality_count)
      )
    `)
    .eq('payment_status', 'PAID')
    .eq('status', 'ALLOCATED')
    .is('deleted_at', null)
    .limit(100)

  const batchIds = Array.from(new Set<string>(
    (orders || [])
      .flatMap((order: any) => Array.isArray(order.order_items) ? order.order_items : [])
      .map((item: any) => item.batch_id)
      .filter((batchId: unknown): batchId is string => typeof batchId === 'string' && batchId.length > 0)
  ))

  const allocatedByBatch = await getAllocatedCountsByBatch(db, batchIds)
  const readyOrderIds = (orders || [])
    .filter((order: any) => {
      const items = Array.isArray(order.order_items) ? order.order_items : []
      return items.some((item: any) => {
        const batch = Array.isArray(item.egg_batches) ? item.egg_batches[0] : item.egg_batches
        if (!item.batch_id || item.status === 'CANCELLED') return false
        if (!['COMPLETED', 'BROODER'].includes(batch?.status || '')) return false

        const availableChicks = Math.max(
          Number(batch.quantity_hatched || 0) -
            Number(batch.quantity_culled || 0) -
            Number(batch.mortality_count || 0),
          0
        )

        return (allocatedByBatch[item.batch_id] || 0) <= availableChicks
      })
    })
    .map((order: any) => order.id)

  if (readyOrderIds.length === 0) return 0

  await db
    .from('orders')
    .update({
      status: 'READY_FOR_DISPATCH',
      dispatch_status: 'SCHEDULED',
      updated_at: new Date().toISOString(),
    })
    .in('id', readyOrderIds)

  return readyOrderIds.length
}

async function getAllocatedCountsByBatch(db: any, batchIds: string[]) {
  if (batchIds.length === 0) return {}

  const { data: allocatedItems } = await db
    .from('order_items')
    .select('batch_id, quantity, status')
    .in('batch_id', batchIds)

  return (allocatedItems || []).reduce((acc: Record<string, number>, item: any) => {
    if (!item.batch_id || item.status === 'CANCELLED') return acc
    acc[item.batch_id] = (acc[item.batch_id] || 0) + Number(item.quantity || 0)
    return acc
  }, {})
}

export async function learnCustomerPreferences(db: any, customerIds?: string[]) {
  let customerQuery = db
    .from('customers')
    .select('id, preferred_breed, preferred_payment_method')
    .is('deleted_at', null)
    .limit(500)

  if (customerIds?.length) {
    customerQuery = customerQuery.in('id', customerIds)
  }

  const { data: customers } = await customerQuery
  const ids = (customers || []).map((customer: any) => customer.id).filter(Boolean)
  if (ids.length === 0) return 0

  const { data: orders } = await db
    .from('orders')
    .select(`
      id,
      customer_id,
      order_items(description),
      order_payments(payment_method, status)
    `)
    .in('customer_id', ids)
    .is('deleted_at', null)

  const historyByCustomer = new Map<string, { breeds: string[]; paymentMethods: string[] }>()
  for (const order of orders || []) {
    const customerHistory = historyByCustomer.get(order.customer_id) || { breeds: [], paymentMethods: [] }
    const items = Array.isArray(order.order_items) ? order.order_items : []
    const payments = Array.isArray(order.order_payments) ? order.order_payments : []

    items.forEach((item: any) => {
      const breed = extractBreedFromDescription(item.description)
      if (breed) customerHistory.breeds.push(breed)
    })

    payments.forEach((payment: any) => {
      if (payment.status === 'COMPLETED' && payment.payment_method) {
        customerHistory.paymentMethods.push(payment.payment_method)
      }
    })

    historyByCustomer.set(order.customer_id, customerHistory)
  }

  let updated = 0
  for (const customer of customers || []) {
    const history = historyByCustomer.get(customer.id)
    if (!history) continue

    const updates: Record<string, string> = {}
    const learnedBreed = mostCommon(history.breeds)
    const learnedPaymentMethod = mostCommon(history.paymentMethods)

    if (!customer.preferred_breed && learnedBreed && history.breeds.filter((breed) => normalizeBreed(breed) === normalizeBreed(learnedBreed)).length >= 2) {
      updates.preferred_breed = learnedBreed
    }

    if (!customer.preferred_payment_method && learnedPaymentMethod) {
      updates.preferred_payment_method = learnedPaymentMethod
    }

    if (Object.keys(updates).length === 0) continue

    await db
      .from('customers')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id)

    updated += 1
  }

  return updated
}

async function getBatchAvailabilityCandidates(db: any): Promise<BatchAvailabilityCandidate[]> {
  const [{ data: batches }, { data: allocatedItems }] = await Promise.all([
    db
      .from('egg_batches')
      .select('id, batch_number, breed_type, quantity_received, quantity_set, accepted_eggs, quantity_hatched, quantity_culled, mortality_count, status, expected_hatch_date')
      .not('status', 'eq', 'DISCARDED')
      .not('status', 'eq', 'FAILED')
      .not('status', 'eq', 'CANCELLED')
      .is('deleted_at', null),
    db
      .from('order_items')
      .select('batch_id, quantity, status')
      .not('batch_id', 'is', null),
  ])

  const allocatedByBatch = (allocatedItems || []).reduce((acc: Record<string, number>, item: any) => {
    if (!item.batch_id || item.status === 'CANCELLED') return acc
    acc[item.batch_id] = (acc[item.batch_id] || 0) + Number(item.quantity || 0)
    return acc
  }, {})

  return (batches || [])
    .map((batch: any) => {
      const projectedLoss = Number(batch.quantity_culled || 0) + Number(batch.mortality_count || 0)
      const incubationBase = Number(batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received ?? 0)
      const baseQuantity = ['COMPLETED', 'BROODER'].includes(batch.status || '')
        ? Number(batch.quantity_hatched || 0)
        : Math.max(0, incubationBase - projectedLoss)
      const allocatedCount = allocatedByBatch[batch.id] || 0

      return {
        id: batch.id,
        batch_number: batch.batch_number,
        breed_type: batch.breed_type,
        status: batch.status,
        expected_hatch_date: batch.expected_hatch_date,
        baseQuantity,
        allocatedCount,
        available: Math.max(0, baseQuantity - allocatedCount),
      }
    })
    .filter((batch: BatchAvailabilityCandidate) => batch.available > 0)
}

function findBestBatch(
  candidates: BatchAvailabilityCandidate[],
  quantity: number,
  requiredByDate?: string | null,
  requestedBreed?: string
) {
  const fulfillable = candidates.filter((batch) => {
    if (batch.available < quantity) return false
    if (!requestedBreed) return true
    return isBreedMatch(batch.breed_type, requestedBreed)
  })
  if (fulfillable.length === 0) return null

  const requiredAt = requiredByDate ? new Date(requiredByDate).getTime() : null
  const dateMatched = requiredAt
    ? fulfillable.filter((batch) => {
        if (!batch.expected_hatch_date) return ['COMPLETED', 'BROODER'].includes(batch.status || '')
        return new Date(batch.expected_hatch_date).getTime() <= requiredAt
      })
    : fulfillable

  const pool = dateMatched.length > 0 ? dateMatched : fulfillable
  return pool.sort((a, b) => {
    const aReady = ['COMPLETED', 'BROODER'].includes(a.status || '') ? 0 : 1
    const bReady = ['COMPLETED', 'BROODER'].includes(b.status || '') ? 0 : 1
    if (aReady !== bReady) return aReady - bReady

    const aDate = a.expected_hatch_date ? new Date(a.expected_hatch_date).getTime() : Number.MAX_SAFE_INTEGER
    const bDate = b.expected_hatch_date ? new Date(b.expected_hatch_date).getTime() : Number.MAX_SAFE_INTEGER
    if (aDate !== bDate) return aDate - bDate

    return a.available - b.available
  })[0]
}

function appendAutomationNote(existingNotes: string | null | undefined, note: string) {
  const current = String(existingNotes || '').trim()
  if (current.includes(note)) return current
  return [current, note].filter(Boolean).join('\n')
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function normalizeBreed(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function isBreedMatch(batchBreed?: string | null, requestedBreed?: string | null) {
  const batchValue = normalizeBreed(batchBreed)
  const requestedValue = normalizeBreed(requestedBreed)
  if (!requestedValue) return true
  if (!batchValue) return false
  return batchValue === requestedValue || batchValue.includes(requestedValue) || requestedValue.includes(batchValue)
}

function mostCommon(values: string[]) {
  const counts = new Map<string, { value: string; count: number }>()
  values.forEach((value) => {
    const key = normalizeBreed(value)
    if (!key) return
    const existing = counts.get(key)
    counts.set(key, { value, count: (existing?.count || 0) + 1 })
  })

  return [...counts.values()].sort((left, right) => right.count - left.count)[0]?.value || ''
}
