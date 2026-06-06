'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logBatchCreated, logBatchUpdated, logBatchStatusChange, logOperationalCostAdded } from '@/lib/audit'
import { runOrderAutomation } from '@/lib/automation/order-automation'
import { getCurrentUserProfile, requireAuth, requireRole } from '@/lib/auth'
import type { CompleteBatchWorkflow } from '@/types/batch-workflow.types'
import { CANDLING_WINDOW_START_DAY, LOCKDOWN_DAY } from '@/lib/incubation/rules'

// Comprehensive batch workflow schema
const workflowBatchSchema = z.object({
  supplier: z.object({
    supplierId: z.string().optional(),
    supplierName: z.string().min(1),
    contactPerson: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    invoiceNumber: z.string().optional(),
    email: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().email().optional()
    ),
  }),
  reception: z.object({
    dateReceived: z.date().or(z.string()),
    receivedBy: z.string().optional(),
    receivedByName: z.string().min(1),
    breedType: z.string().min(1),
    totalEggsReceived: z.number().int().positive(),
    notes: z.string().optional(),
  }),
  inspection: z.object({
    crackedEggs: z.number().int().min(0),
    dirtyEggs: z.number().int().min(0),
    rejectedEggs: z.number().int().min(0),
    acceptedEggs: z.number().int().min(0).optional(),
    inspectionStatus: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('COMPLETED'),
    inspectionCompletedAt: z.date().optional(),
    inspectionNotes: z.string().optional(),
  }),
  costs: z.object({
    eggPurchaseCost: z.number().min(0),
    transportCost: z.number().min(0),
    loadingOffloadingCost: z.number().min(0),
    miscellaneousCost: z.number().min(0),
    totalAcquisitionCost: z.number().optional(),
    costPerAcceptedEgg: z.number().optional(),
  }),
  incubationAssignment: z.object({
    incubatorId: z.string().min(1),
    setDate: z.date().or(z.string()),
    expectedHatchDate: z.date().or(z.string()),
    responsibleTechnician: z.string().optional(),
    startColumnNumber: z.number().int().min(1).max(6).optional(),
    startRowNumber: z.number().int().min(1).max(2).optional(),
    assignmentNotes: z.string().optional(),
    autoAllocate: z.boolean().optional(),
    placementSummary: z.string().optional(),
    allocations: z.array(z.object({
      columnNumber: z.number().int().positive(),
      rowNumber: z.number().int().positive(),
      slotCapacity: z.number().int().positive(),
      eggsAllocated: z.number().int().positive(),
    })).optional(),
  }).optional(),
})

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type IncubatorAllocationPlan = {
  allocations: Array<{
    columnNumber: number
    rowNumber: number
    slotCapacity: number
    eggsAllocated: number
  }>
  summary: string
}

const DEFAULT_BREEDS = [
  'KARI Improved Kienyeji',
  'Improved Kienyeji',
  'Broiler',
  'Layer',
  'Local Kienyeji',
]

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function addDaysToDate(value: Date | string, days: number) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

async function getBatchDefaults(supabase: SupabaseServerClient, tenantId: string | null) {
  let query = supabase
    .from('business_settings')
    .select('default_incubation_days, breed_options')
    .limit(1)

  query = tenantId ? query.eq('tenant_id', tenantId) : query

  const { data } = await query.maybeSingle()
  return {
    defaultIncubationDays: Number(data?.default_incubation_days || 21),
    breedOptions: Array.isArray(data?.breed_options) && data.breed_options.length > 0
      ? data.breed_options
      : DEFAULT_BREEDS,
  }
}

function normalizeBreed(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function normalizeEntityText(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function findCatalogBreed(value: string, breedOptions: string[]) {
  const requestedValue = normalizeBreed(value)
  if (!requestedValue) return null
  return breedOptions.find((breed) => normalizeBreed(breed) === requestedValue) || null
}

async function findReusableSupplier(
  supabase: SupabaseServerClient,
  tenantId: string | null,
  supplier: z.infer<typeof workflowBatchSchema>['supplier']
) {
  if (supplier.supplierId) {
    let query = supabase
      .from('suppliers')
      .select('id, name, contact_name, phone, email, address')
      .eq('id', supplier.supplierId)
      .is('deleted_at', null)
      .limit(1)

    query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null)

    const { data, error } = await query.maybeSingle()
    if (error) return { error: error.message }
    if (data) return { supplier: data }
  }

  const phone = supplier.phone?.trim()
  const email = supplier.email?.trim()
  const supplierNameNorm = normalizeEntityText(supplier.supplierName)

  if (phone) {
    let query = supabase
      .from('suppliers')
      .select('id, name, contact_name, phone, email, address')
      .eq('phone', phone)
      .is('deleted_at', null)
      .limit(1)

    query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null)

    const { data, error } = await query.maybeSingle()
    if (error) return { error: error.message }
    if (data) return { supplier: data }
  }

  if (email) {
    let query = supabase
      .from('suppliers')
      .select('id, name, contact_name, phone, email, address')
      .ilike('email', email)
      .is('deleted_at', null)
      .limit(1)

    query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null)

    const { data, error } = await query.maybeSingle()
    if (error) return { error: error.message }
    if (data) return { supplier: data }
  }

  let nameQuery = supabase
    .from('suppliers')
    .select('id, name, contact_name, phone, email, address')
    .is('deleted_at', null)
    .limit(500)

  nameQuery = tenantId ? nameQuery.eq('tenant_id', tenantId) : nameQuery.is('tenant_id', null)

  const { data: suppliers, error } = await nameQuery
  if (error) return { error: error.message }

  const supplierMatch = (suppliers || []).find((entry) => normalizeEntityText(entry.name) === supplierNameNorm)
  return { supplier: supplierMatch || null }
}

async function refreshSupplierDetails(
  supabase: SupabaseServerClient,
  supplierId: string,
  supplier: z.infer<typeof workflowBatchSchema>['supplier']
) {
  const updates: Record<string, string> = {}
  if (supplier.contactPerson?.trim()) updates.contact_name = supplier.contactPerson.trim()
  if (supplier.phone?.trim()) updates.phone = supplier.phone.trim()
  if (supplier.email?.trim()) updates.email = supplier.email.trim()
  if (supplier.location?.trim()) updates.address = supplier.location.trim()

  if (Object.keys(updates).length === 0) return

  await supabase
    .from('suppliers')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierId)
}

async function buildIncubatorAllocationPlan(
  supabase: SupabaseServerClient,
  incubatorId: string,
  eggsToPlace: number,
  startColumnNumber = 1,
  startRowNumber = 1
): Promise<IncubatorAllocationPlan | { error: string }> {
  const { data: incubator, error: incubatorError } = await supabase
    .from('incubators')
    .select('id, name, capacity')
    .eq('id', incubatorId)
    .maybeSingle()

  if (incubatorError) {
    return {
      error: `Unable to read incubator placement settings. Apply the latest Supabase migration, then try again. ${incubatorError.message}`,
    }
  }

  if (!incubator) {
    return { error: 'Selected incubator was not found.' }
  }

  const columns = 6
  const rows = 2
  const eggsPerSlot = 88
  const capacity = Number(incubator.capacity) || columns * rows * eggsPerSlot

  const { data: existingAllocations, error: allocationError } = await supabase
    .from('batch_incubator_allocations')
    .select('column_number, row_number, eggs_allocated')
    .eq('incubator_id', incubatorId)

  if (allocationError) {
    return {
      error: `Incubator slot tracking is not available. Apply the latest Supabase migration, then try again. ${allocationError.message}`,
    }
  }

  const occupied = new Map<string, number>()
  for (const allocation of existingAllocations || []) {
    const key = `${allocation.column_number}-${allocation.row_number}`
    occupied.set(key, (occupied.get(key) || 0) + Number(allocation.eggs_allocated || 0))
  }

  let remaining = eggsToPlace
  const allocations: IncubatorAllocationPlan['allocations'] = []
  const slots = []

  for (let column = 1; column <= columns; column += 1) {
    for (let row = 1; row <= rows; row += 1) {
      slots.push({ column, row })
    }
  }

  const startIndex = slots.findIndex(
    (slot) => slot.column === startColumnNumber && slot.row === startRowNumber
  )
  const usableSlots = startIndex >= 0 ? slots.slice(startIndex) : slots

  for (const slot of usableSlots) {
    if (remaining <= 0) break

      const key = `${slot.column}-${slot.row}`
      const available = Math.max(eggsPerSlot - (occupied.get(key) || 0), 0)
      if (available <= 0) continue

      const eggsAllocated = Math.min(remaining, available)
      allocations.push({
        columnNumber: slot.column,
        rowNumber: slot.row,
        slotCapacity: eggsPerSlot,
        eggsAllocated,
      })
      remaining -= eggsAllocated
  }

  if (remaining > 0) {
    return {
      error: `${incubator.name} does not have enough free tray space from Unit ${startColumnNumber}, Tray ${startRowNumber}. ${remaining.toLocaleString()} eggs could not be placed.`,
    }
  }

  const slotText = allocations
    .map((slot) => `Unit ${slot.columnNumber}, Tray ${slot.rowNumber} ${slot.eggsAllocated} eggs`)
    .join(', ')

  return {
    allocations,
    summary: `Placed ${eggsToPlace.toLocaleString()} eggs in ${incubator.name}: ${slotText}.`,
  }
}

/**
 * Create a complete batch with all operational workflow data
 */
export async function createBatch(workflow: CompleteBatchWorkflow) {
  try {
    const result = workflowBatchSchema.safeParse(workflow)
    if (!result.success) {
      return {
        success: false,
        error: `Validation error: ${result.error.message}`,
      }
    }

    const supabase = await createClient()
    const profileResult = await ensureUserProfile(supabase)

    if (profileResult.error) {
      return { success: false, error: profileResult.error }
    }

    if (!profileResult.profile) {
      return { success: false, error: 'User profile not found' }
    }

    const profile = profileResult.profile
    const batchDefaults = await getBatchDefaults(supabase, profile.tenant_id || null)
    const catalogBreed = findCatalogBreed(workflow.reception.breedType, batchDefaults.breedOptions)
    if (!catalogBreed) {
      return { success: false, error: 'Select a valid breed from Settings before creating this batch.' }
    }

    // Generate batch number with timestamp and random suffix
    const now = new Date()
    const batchNumber = `BCH-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`

    // Calculate totals
    const totalCost =
      workflow.costs.eggPurchaseCost +
      workflow.costs.transportCost +
      workflow.costs.loadingOffloadingCost +
      workflow.costs.miscellaneousCost

    const acceptedEggs =
      workflow.reception.totalEggsReceived -
      (workflow.inspection.crackedEggs +
        workflow.inspection.dirtyEggs +
        workflow.inspection.rejectedEggs)

    const costPerAcceptedEgg = acceptedEggs > 0 ? totalCost / acceptedEggs : 0

    const supplierName = workflow.supplier.supplierName.trim()
    let supplierId: string | null = null

    if (supplierName) {
      const reusableSupplier = await findReusableSupplier(supabase, profile.tenant_id || null, workflow.supplier)

      if (reusableSupplier.error) {
        return { success: false, error: reusableSupplier.error }
      }

      if (reusableSupplier.supplier) {
        supplierId = reusableSupplier.supplier.id
        if (supplierId) {
          await refreshSupplierDetails(supabase, supplierId, workflow.supplier)
        }
      } else {
        const { data: newSupplier, error: supplierInsertError } = await supabase
          .from('suppliers')
          .insert({
            tenant_id: profile.tenant_id || null,
            name: supplierName,
            contact_name: workflow.supplier.contactPerson || null,
            phone: workflow.supplier.phone || null,
            email: workflow.supplier.email || null,
            address: workflow.supplier.location || null,
            created_by: profile.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sync_version: 1,
          })
          .select()
          .single()

        if (supplierInsertError) {
          return { success: false, error: supplierInsertError.message }
        }

        supplierId = newSupplier?.id || null
      }
    }

    const hasAssignment = Boolean(workflow.incubationAssignment)
    let placementPlan: IncubatorAllocationPlan | null = null

    if (hasAssignment) {
      if (acceptedEggs <= 0) {
        return { success: false, error: 'Accepted eggs must be greater than zero before placing the batch in an incubator.' }
      }

      const plan = await buildIncubatorAllocationPlan(
        supabase,
        workflow.incubationAssignment!.incubatorId,
        acceptedEggs,
        workflow.incubationAssignment!.startColumnNumber || 1,
        workflow.incubationAssignment!.startRowNumber || 1
      )

      if ('error' in plan) {
        return { success: false, error: plan.error }
      }

      placementPlan = plan
    }

    const setDate = hasAssignment ? toIsoString(workflow.incubationAssignment!.setDate) : null
    const expectedHatchDate = hasAssignment
      ? toIsoString(addDaysToDate(workflow.incubationAssignment!.setDate, batchDefaults.defaultIncubationDays))
      : null
    const incubatorId = hasAssignment ? workflow.incubationAssignment!.incubatorId : null
    const batchStatus = hasAssignment ? 'SETTER' : 'LOGGED'
    const quantitySet = hasAssignment ? acceptedEggs : null

    // Create main batch record
    const { data: newBatch, error: batchError } = await supabase
      .from('egg_batches')
      .insert({
        tenant_id: profile.tenant_id || null,
        batch_number: batchNumber,
        quantity_received: workflow.reception.totalEggsReceived,
        status: batchStatus,
        supplier_id: supplierId,
        incubator_id: incubatorId,
        quantity_set: quantitySet,
        date_received: toIsoString(workflow.reception.dateReceived),
        received_by: workflow.reception.receivedBy || profile.id || null,
        received_by_name: workflow.reception.receivedByName.trim(),
        breed_type: catalogBreed,
        invoice_number: workflow.supplier.invoiceNumber || null,
        contact_person: workflow.supplier.contactPerson || null,
        supplier_phone: workflow.supplier.phone || null,
        supplier_location: workflow.supplier.location || null,
        notes: workflow.reception.notes || null,
        set_date: setDate,
        expected_hatch_date: expectedHatchDate,
        placement_summary: placementPlan?.summary || null,
        cracked_eggs: workflow.inspection.crackedEggs,
        dirty_eggs: workflow.inspection.dirtyEggs,
        rejected_eggs: workflow.inspection.rejectedEggs,
        accepted_eggs: acceptedEggs,
        inspection_status: 'COMPLETED',
        inspection_completed_at: toIsoString(workflow.inspection.inspectionCompletedAt) || new Date().toISOString(),
        inspection_notes: workflow.inspection.inspectionNotes,
        egg_purchase_cost: workflow.costs.eggPurchaseCost,
        transport_cost: workflow.costs.transportCost,
        loading_offloading_cost: workflow.costs.loadingOffloadingCost,
        misc_initial_cost: workflow.costs.miscellaneousCost,
        total_initial_cost: totalCost,
        cost_per_accepted_egg: costPerAcceptedEgg,
        responsible_technician: workflow.incubationAssignment?.responsibleTechnician || profile.id,
        created_by: profile.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_version: 1,
      })
      .select()
      .single()

    if (batchError) {
      console.error('Error creating batch:', batchError)
      return { success: false, error: batchError.message || 'Failed to create batch' }
    }

    // Create inspection record for audit trail
    const { error: inspectionError } = await supabase
      .from('batch_inspection_records')
      .insert({
        batch_id: newBatch.id,
        cracked_eggs: workflow.inspection.crackedEggs,
        dirty_eggs: workflow.inspection.dirtyEggs,
        rejected_eggs: workflow.inspection.rejectedEggs,
        accepted_eggs: acceptedEggs,
        inspection_notes: workflow.inspection.inspectionNotes,
        inspected_by: profile.id,
        inspected_at: new Date().toISOString(),
        sync_version: 1,
      })

    if (inspectionError) {
      console.warn('Warning: Failed to create inspection record:', inspectionError)
    }

    // Create cost breakdown records
    const costRecords = [
      {
        batch_id: newBatch.id,
        cost_type: 'EGG_PURCHASE',
        amount: workflow.costs.eggPurchaseCost,
        currency: 'KES',
        description: 'Egg purchase cost from supplier',
        cost_date: new Date().toISOString().split('T')[0],
        recorded_by: profile.id,
        sync_version: 1,
      },
      {
        batch_id: newBatch.id,
        cost_type: 'TRANSPORT',
        amount: workflow.costs.transportCost,
        currency: 'KES',
        description: 'Transport and delivery cost',
        cost_date: new Date().toISOString().split('T')[0],
        recorded_by: profile.id,
        sync_version: 1,
      },
      {
        batch_id: newBatch.id,
        cost_type: 'LOADING_OFFLOADING',
        amount: workflow.costs.loadingOffloadingCost,
        currency: 'KES',
        description: 'Loading and offloading cost',
        cost_date: new Date().toISOString().split('T')[0],
        recorded_by: profile.id,
        sync_version: 1,
      },
      {
        batch_id: newBatch.id,
        cost_type: 'MISCELLANEOUS',
        amount: workflow.costs.miscellaneousCost,
        currency: 'KES',
        description: 'Other miscellaneous costs',
        cost_date: new Date().toISOString().split('T')[0],
        recorded_by: profile.id,
        sync_version: 1,
      },
    ].filter(c => c.amount > 0)

    if (costRecords.length > 0) {
      const { error: costError } = await supabase
        .from('batch_acquisition_costs')
        .insert(costRecords)

      if (costError) {
        console.warn('Warning: Failed to create cost records:', costError)
      }
    }

    // Create incubation assignment if provided
    if (workflow.incubationAssignment) {
      const { error: assignmentError } = await supabase
        .from('batch_incubation_assignments')
        .insert({
          batch_id: newBatch.id,
          incubator_id: workflow.incubationAssignment.incubatorId,
          responsible_technician: workflow.incubationAssignment.responsibleTechnician || profile.id,
          set_date: setDate,
          expected_hatch_date: expectedHatchDate,
          assignment_notes: workflow.incubationAssignment.assignmentNotes || placementPlan?.summary || null,
          assigned_by: profile.id,
          status: 'ASSIGNED',
          sync_version: 1,
        })

      if (assignmentError) {
        console.warn('Warning: Failed to create incubation assignment:', assignmentError)
      }

      if (placementPlan?.allocations.length) {
        const { error: allocationInsertError } = await supabase
          .from('batch_incubator_allocations')
          .insert(placementPlan.allocations.map((slot) => ({
            batch_id: newBatch.id,
            incubator_id: workflow.incubationAssignment!.incubatorId,
            column_number: slot.columnNumber,
            row_number: slot.rowNumber,
            slot_capacity: slot.slotCapacity,
            eggs_allocated: slot.eggsAllocated,
            assigned_by: profile.id,
            sync_version: 1,
          })))

        if (allocationInsertError) {
          console.warn('Warning: Failed to create incubator slot allocations:', allocationInsertError)
        }
      }
    }

    // Log audit trail
    await logBatchCreated(newBatch.id, {
      batchNumber,
      supplier: workflow.supplier.supplierName,
      eggs: acceptedEggs,
      totalCost,
    })

    revalidatePath('/batches')
    revalidatePath('/incubation')
    return { success: true, batchId: newBatch.id, batchNumber }
  } catch (err: any) {
    console.error('Error in createBatch:', err)
    return { success: false, error: err.message || 'An error occurred' }
  }
}

async function ensureUserProfile(supabase: Awaited<ReturnType<typeof createClient>>) {
  const existingProfile = await getCurrentUserProfile()
  if (existingProfile) return { profile: existingProfile }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'User not authenticated' }

  const email = user.email || (user.user_metadata as any)?.email
  if (!email) return { error: 'User email missing. Please update your account email.' }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (tenantError) {
    return { error: tenantError.message }
  }

  let roleId: string | null = null
  if (tenant?.id) {
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('role_code', 'MANAGER')
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    if (roleError) {
      return { error: roleError.message }
    }

    roleId = role?.id || null
  }

  const { data: createdProfile, error: createError } = await supabase
    .from('user_profiles')
    .insert({
      id: user.id,
      tenant_id: tenant?.id || null,
      email,
      first_name: (user.user_metadata as any)?.first_name || null,
      last_name: (user.user_metadata as any)?.last_name || null,
      phone: (user.user_metadata as any)?.phone || null,
      status: 'ACTIVE',
      primary_role_id: roleId,
      activated_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (createError) {
    return { error: createError.message }
  }

  return { profile: createdProfile || null }
}

export async function updateBatchStatus(id: string, status: string, additionalUpdates: any = {}) {
  const supabase = await createClient()

  // Get current batch for audit
  const { data: currentBatch } = await supabase
    .from('egg_batches')
    .select('*')
    .eq('id', id)
    .single()

  if (!currentBatch) {
    return { success: false, error: 'Batch not found' }
  }

  const nextBatch = { ...currentBatch, ...additionalUpdates, status }
  if (
    ['SETTER', 'HATCHER', 'BROODER'].includes(status) &&
    (!nextBatch.incubator_id || !nextBatch.set_date || !nextBatch.expected_hatch_date)
  ) {
    return {
      success: false,
      error: 'Assign an incubator, set date, and expected hatch date before moving this batch into incubation.',
    }
  }

  const { error } = await supabase
    .from('egg_batches')
    .update({ 
      status, 
      ...additionalUpdates,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || 'Failed to update status' }
  }

  if (['COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED'].includes(status)) {
    await supabase
      .from('batch_incubator_allocations')
      .delete()
      .eq('batch_id', id)
  }

  // Log changes
  if (status !== currentBatch.status) {
    await logBatchStatusChange(id, currentBatch.status, status)
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  revalidatePath('/incubation')
  return { success: true }
}

export async function deleteBatch(id: string) {
  const supabase = await createClient()

  // Soft delete: set deleted_at instead of hard delete
  const { error } = await supabase
    .from('egg_batches')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    return { success: false, error: 'Failed to delete batch' }
  }

  await supabase
    .from('batch_incubator_allocations')
    .delete()
    .eq('batch_id', id)

  revalidatePath('/batches')
  revalidatePath('/incubation')
  return { success: true }
}

export async function restoreBatch(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('egg_batches')
    .update({
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .not('deleted_at', 'is', null)

  if (error) {
    return { success: false, error: error.message || 'Failed to restore batch' }
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  return { success: true }
}

/**
 * Permanently remove a batch and related records from the database and storage.
 * This action is restricted to admin users and is intentionally not exposed in the UI.
 */
export async function hardDeleteBatch(id: string) {
  await requireRole('SUPER_ADMIN')

  const supabase = await createClient()

  try {
    // Attempt to remove any files in storage referenced by batch_attachments
    const { data: attachments, error: attachFetchError } = await supabase
      .from('batch_attachments')
      .select('id, storage_path')
      .eq('batch_id', id)

    if (attachFetchError) {
      console.warn('Failed to fetch attachments for hard delete:', attachFetchError)
    }

    const pathsToRemove: string[] = []
    if (attachments && Array.isArray(attachments)) {
      for (const a of attachments) {
        if (a.storage_path) pathsToRemove.push(a.storage_path)
      }
    }

    if (pathsToRemove.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('batch-attachments')
        .remove(pathsToRemove)

      if (storageError) {
        console.warn('Warning: failed to remove storage files during hard delete:', storageError)
      }
    }

    // Remove dependent records explicitly
    const tablesToClear = [
      'batch_attachments',
      'batch_inspection_records',
      'batch_acquisition_costs',
      'batch_incubation_assignments',
      'batch_incubator_allocations',
      'cost_entries',
    ]

    for (const tbl of tablesToClear) {
      const { error: delErr } = await supabase
        .from(tbl)
        .delete()
        .eq('batch_id', id)

      if (delErr) {
        console.warn(`Warning: failed to delete from ${tbl} for batch ${id}:`, delErr)
      }
    }

    // Finally delete the batch row itself
    const { error: batchDeleteError } = await supabase
      .from('egg_batches')
      .delete()
      .eq('id', id)

    if (batchDeleteError) {
      console.error('Failed to hard delete batch:', batchDeleteError)
      return { success: false, error: batchDeleteError.message || 'Failed to hard delete batch' }
    }

    revalidatePath('/batches')
    revalidatePath(`/batches/${id}`)
    return { success: true }
  } catch (err: any) {
    console.error('Error in hardDeleteBatch:', err)
    return { success: false, error: err?.message || 'An error occurred during hard delete' }
  }
}

async function getCurrentUserId(supabase: SupabaseServerClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id || null
}

export async function recordCandling(id: string, culledCount: number, notes?: string) {
  const supabase = await createClient()

  const { data: currentBatch, error: fetchError } = await supabase
    .from('egg_batches')
    .select('id, status, set_date, quantity_received, quantity_set, accepted_eggs, quantity_culled')
    .eq('id', id)
    .single()

  if (fetchError || !currentBatch) {
    return { success: false, error: fetchError?.message || 'Batch not found' }
  }

  if (!currentBatch.set_date) {
    return { success: false, error: 'Place the batch in an incubator before recording candling.' }
  }

  const candlingOpensAt = new Date(currentBatch.set_date)
  candlingOpensAt.setDate(candlingOpensAt.getDate() + CANDLING_WINDOW_START_DAY)

  if (new Date() < candlingOpensAt) {
    return {
      success: false,
      error: `Candling is not due yet. It opens on ${candlingOpensAt.toLocaleDateString()} at ${candlingOpensAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
    }
  }

  if (['COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED'].includes(currentBatch.status || '')) {
    return { success: false, error: 'Candling cannot be recorded for a closed batch.' }
  }

  const loadedEggs = Number(currentBatch.quantity_set ?? currentBatch.accepted_eggs ?? currentBatch.quantity_received ?? 0)
  if (!Number.isFinite(culledCount) || culledCount < 0) {
    return { success: false, error: 'Candling removal count cannot be negative' }
  }

  if (culledCount > loadedEggs) {
    return { success: false, error: `Removed eggs cannot exceed ${loadedEggs.toLocaleString()} loaded eggs` }
  }

  const recordedBy = await getCurrentUserId(supabase)
  const { error } = await (supabase as any).rpc('record_candling_atomic', {
    p_batch_id: id,
    p_culled_count: culledCount,
    p_notes: notes || null,
    p_recorded_by: recordedBy,
  })

  if (error) {
    return { success: false, error: error.message || 'Failed to record candling' }
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  revalidatePath('/incubation')
  revalidatePath('/alerts')
  return { success: true }
}

export async function moveBatchToHatcher(id: string, notes?: string) {
  const supabase = await createClient()

  const { data: currentBatch, error: fetchError } = await supabase
    .from('egg_batches')
    .select('id, status, incubator_id, set_date, expected_hatch_date')
    .eq('id', id)
    .single()

  if (fetchError || !currentBatch) {
    return { success: false, error: fetchError?.message || 'Batch not found' }
  }

  if (!currentBatch.incubator_id || !currentBatch.set_date || !currentBatch.expected_hatch_date) {
    return { success: false, error: 'Place the batch in an incubator before moving it to hatch prep.' }
  }

  const lockdownOpensAt = new Date(currentBatch.set_date)
  lockdownOpensAt.setDate(lockdownOpensAt.getDate() + LOCKDOWN_DAY)

  if (new Date() < lockdownOpensAt) {
    return {
      success: false,
      error: `Hatch prep is not due yet. It opens on ${lockdownOpensAt.toLocaleDateString()} at ${lockdownOpensAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
    }
  }

  const recordedBy = await getCurrentUserId(supabase)
  const { error } = await (supabase as any).rpc('move_batch_to_hatcher_atomic', {
    p_batch_id: id,
    p_notes: notes || null,
    p_recorded_by: recordedBy,
  })

  if (error) {
    return { success: false, error: error.message || 'Failed to move batch to hatch prep' }
  }

  if (currentBatch.status !== 'HATCHER') {
    await logBatchStatusChange(id, currentBatch.status, 'HATCHER')
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  revalidatePath('/incubation')
  revalidatePath('/alerts')
  return { success: true }
}

export async function recordHatch(id: string, hatchedCount: number, finalCulledCount = 0, notes?: string) {
  const supabase = await createClient()
  const db = supabase as any

  const { data: currentBatch, error: fetchError } = await supabase
    .from('egg_batches')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchError || !currentBatch) {
    return { success: false, error: fetchError?.message || 'Batch not found' }
  }

  if (!Number.isFinite(hatchedCount) || hatchedCount < 0) {
    return { success: false, error: 'Hatched count cannot be negative' }
  }

  if (!Number.isFinite(finalCulledCount) || finalCulledCount < 0) {
    return { success: false, error: 'Final culled count cannot be negative' }
  }

  const recordedBy = await getCurrentUserId(supabase)
  const { error } = await db.rpc('record_hatch_atomic', {
    p_batch_id: id,
    p_hatched_count: hatchedCount,
    p_final_culled_count: finalCulledCount,
    p_notes: notes || null,
    p_recorded_by: recordedBy,
  })

  if (error) {
    return { success: false, error: error.message || 'Failed to record hatch' }
  }

  if (currentBatch.status !== 'COMPLETED') {
    await logBatchStatusChange(id, currentBatch.status, 'COMPLETED')
  }

  await markPaidOrdersReadyForHandover(db, id)
  await runOrderAutomation(db)

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  revalidatePath('/incubation')
  revalidatePath('/dashboard')
  revalidatePath('/orders')
  revalidatePath('/alerts')
  return { success: true }
}

async function markPaidOrdersReadyForHandover(db: any, batchId: string) {
  const [{ data: batch }, { data: allocatedItems }] = await Promise.all([
    db
      .from('egg_batches')
      .select('quantity_hatched, quantity_culled, mortality_count')
      .eq('id', batchId)
      .maybeSingle(),
    db
      .from('order_items')
      .select('order_id, quantity')
      .eq('batch_id', batchId)
      .neq('status', 'CANCELLED'),
  ])

  const totalAllocated = (allocatedItems || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
  const availableChicks = Math.max(
    Number(batch?.quantity_hatched || 0) -
      Number(batch?.quantity_culled || 0) -
      Number(batch?.mortality_count || 0),
    0
  )

  if (totalAllocated > availableChicks) return

  const orderIds = Array.from(new Set((allocatedItems || []).map((item: any) => item.order_id).filter(Boolean)))
  if (orderIds.length === 0) return

  await db
    .from('order_items')
    .update({
      status: 'ALLOCATED',
      updated_at: new Date().toISOString(),
    })
    .eq('batch_id', batchId)
    .neq('status', 'CANCELLED')

  await db
    .from('orders')
    .update({
      status: 'READY_FOR_DISPATCH',
      dispatch_status: 'SCHEDULED',
      updated_at: new Date().toISOString(),
    })
    .in('id', orderIds)
    .eq('payment_status', 'PAID')
    .in('status', ['ALLOCATED', 'CONFIRMED', 'RESERVED'])
    .is('deleted_at', null)
}

const operationalCostSchema = z.object({
  batch_id: z.string(),
  category: z.enum(['ELECTRICITY', 'GENERATOR_FUEL', 'LABOR', 'VACCINATION', 'MAINTENANCE', 'PACKAGING', 'TRANSPORT', 'MEDICATION', 'OTHER']),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be greater than 0'),
})

const operationalCostCategoryMap: Record<
  z.infer<typeof operationalCostSchema>['category'],
  { name: string; expenseType: string }
> = {
  ELECTRICITY: { name: 'Electricity', expenseType: 'ELECTRICITY' },
  GENERATOR_FUEL: { name: 'Generator Fuel', expenseType: 'FUEL' },
  LABOR: { name: 'Labor', expenseType: 'LABOR' },
  VACCINATION: { name: 'Vaccination', expenseType: 'VACCINE' },
  MAINTENANCE: { name: 'Maintenance', expenseType: 'MAINTENANCE' },
  PACKAGING: { name: 'Packaging', expenseType: 'OTHER' },
  TRANSPORT: { name: 'Transport / Distribution', expenseType: 'TRANSPORT' },
  MEDICATION: { name: 'Medication', expenseType: 'MEDICINE' },
  OTHER: { name: 'Other Operational Cost', expenseType: 'OTHER' },
}

async function findOrCreateExpenseCategory(
  supabase: SupabaseServerClient,
  tenantId: string | null,
  category: z.infer<typeof operationalCostSchema>['category']
) {
  const categoryInfo = operationalCostCategoryMap[category]
  let query = supabase
    .from('expense_categories')
    .select('id')
    .eq('name', categoryInfo.name)
    .is('deleted_at', null)
    .limit(1)

  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null)

  const { data: existingCategories, error: fetchError } = await query
  if (fetchError) return { error: fetchError.message }

  const existingCategory = existingCategories?.[0]
  if (existingCategory?.id) return { id: existingCategory.id }

  const { data: createdCategory, error: createError } = await supabase
    .from('expense_categories')
    .insert({
      tenant_id: tenantId,
      name: categoryInfo.name,
      expense_type: categoryInfo.expenseType,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sync_version: 1,
    })
    .select('id')
    .single()

  if (createError) return { error: createError.message }
  return { id: createdCategory.id }
}

export async function addOperationalCost(formData: FormData) {
  const result = operationalCostSchema.safeParse({
    batch_id: formData.get('batch_id'),
    category: formData.get('category'),
    description: formData.get('description'),
    amount: Number(formData.get('amount')),
  })

  if (!result.success) {
    return { success: false, errors: result.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const profileResult = await ensureUserProfile(supabase)
  if ('error' in profileResult) {
    return { success: false, error: profileResult.error }
  }

  const profile = profileResult.profile
  const tenantId = (profile as any)?.tenant_id || null
  const categoryResult = await findOrCreateExpenseCategory(supabase, tenantId, result.data.category)
  if ('error' in categoryResult) {
    return { success: false, error: categoryResult.error }
  }

  const { data: costRecord, error } = await supabase.from('cost_entries').insert({
    tenant_id: tenantId,
    category_id: categoryResult.id,
    batch_id: result.data.batch_id,
    amount: result.data.amount,
    description: result.data.description,
    incurred_at: new Date().toISOString(),
    recorded_by: profile?.id || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sync_version: 1,
  }).select().single()

  if (error) {
    console.error('Error logging cost:', error)
    return { success: false, error: error.message || 'Failed to log cost' }
  }

  // Log audit trail
  await logOperationalCostAdded(costRecord.id, result.data.batch_id, result.data.amount, result.data.category)

  revalidatePath(`/batches/${result.data.batch_id}`)
  return { success: true }
}
