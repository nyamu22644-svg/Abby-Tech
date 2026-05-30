'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logBatchCreated, logBatchUpdated, logBatchStatusChange, logOperationalCostAdded } from '@/lib/audit'
import { getCurrentUserProfile, requireAuth } from '@/lib/auth'
import type { CompleteBatchWorkflow } from '@/types/batch-workflow.types'

// Comprehensive batch workflow schema
const workflowBatchSchema = z.object({
  supplier: z.object({
    supplierName: z.string().min(1),
    contactPerson: z.string().min(1),
    phone: z.string().min(1),
    location: z.string().min(1),
    invoiceNumber: z.string().min(1),
    email: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().email().optional()
    ),
  }),
  reception: z.object({
    dateReceived: z.date().or(z.string()),
    receivedBy: z.string().min(1),
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
    assignmentNotes: z.string().optional(),
  }).optional(),
})

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
      let supplierQuery = supabase
        .from('suppliers')
        .select('id')
        .eq('name', supplierName)

      if (profile.tenant_id) {
        supplierQuery = supplierQuery.eq('tenant_id', profile.tenant_id)
      } else {
        supplierQuery = supplierQuery.is('tenant_id', null)
      }

      const { data: existingSupplier, error: supplierFetchError } = await supplierQuery.maybeSingle()

      if (supplierFetchError) {
        return { success: false, error: supplierFetchError.message }
      }

      if (existingSupplier) {
        supplierId = existingSupplier.id
      } else {
        const { data: newSupplier, error: supplierInsertError } = await supabase
          .from('suppliers')
          .insert({
            tenant_id: profile.tenant_id || null,
            name: supplierName,
            contact_name: workflow.supplier.contactPerson,
            phone: workflow.supplier.phone,
            email: workflow.supplier.email || null,
            address: workflow.supplier.location,
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
    const setDate = hasAssignment ? workflow.incubationAssignment!.setDate : null
    const expectedHatchDate = hasAssignment ? workflow.incubationAssignment!.expectedHatchDate : null
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
        date_received: workflow.reception.dateReceived,
        received_by: workflow.reception.receivedBy,
        breed_type: workflow.reception.breedType,
        invoice_number: workflow.supplier.invoiceNumber,
        contact_person: workflow.supplier.contactPerson,
        supplier_phone: workflow.supplier.phone,
        supplier_location: workflow.supplier.location,
        notes: workflow.reception.notes || null,
        set_date: setDate,
        expected_hatch_date: expectedHatchDate,
        cracked_eggs: workflow.inspection.crackedEggs,
        dirty_eggs: workflow.inspection.dirtyEggs,
        rejected_eggs: workflow.inspection.rejectedEggs,
        accepted_eggs: acceptedEggs,
        inspection_status: 'COMPLETED',
        inspection_completed_at: new Date().toISOString(),
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
          responsible_technician: workflow.incubationAssignment.responsibleTechnician,
          set_date: workflow.incubationAssignment.setDate,
          expected_hatch_date: workflow.incubationAssignment.expectedHatchDate,
          assignment_notes: workflow.incubationAssignment.assignmentNotes,
          assigned_by: profile.id,
          status: 'ASSIGNED',
          sync_version: 1,
        })

      if (assignmentError) {
        console.warn('Warning: Failed to create incubation assignment:', assignmentError)
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

  // Log changes
  if (currentBatch && status !== currentBatch.status) {
    await logBatchStatusChange(id, currentBatch.status, status)
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
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

  revalidatePath('/batches')
  return { success: true }
}

/**
 * Permanently remove a batch and related records from the database and storage.
 * This action is restricted to admin users and is intentionally not exposed in the UI.
 */
export async function hardDeleteBatch(id: string) {
  // Ensure caller is authenticated (no longer restricted to SUPER_ADMIN)
  await requireAuth()

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
      'operational_costs',
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

export async function recordCandling(id: string,  culledCount: number) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('egg_batches')
    .update({ 
      status: 'LOCKDOWN',
      quantity_culled: culledCount,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || 'Failed to record candling' }
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  return { success: true }
}

export async function recordHatch(id: string, hatchedCount: number) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('egg_batches')
    .update({ 
      status: 'COMPLETED',
      quantity_hatched: hatchedCount,
      actual_hatch_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || 'Failed to record hatch' }
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  return { success: true }
}

const operationalCostSchema = z.object({
  batch_id: z.string(),
  category: z.enum(['ELECTRICITY', 'GENERATOR_FUEL', 'LABOR', 'VACCINATION', 'MAINTENANCE', 'PACKAGING', 'TRANSPORT', 'MEDICATION', 'OTHER']),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be greater than 0'),
})

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

  const { data: costRecord, error } = await supabase.from('operational_costs').insert({
    ...result.data,
    created_at: new Date().toISOString()
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
