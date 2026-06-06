'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { createBatch } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { useSubmitLock } from '@/hooks/use-submit-lock'
import type { CompleteBatchWorkflow } from '@/types/batch-workflow.types'
import { SupplierInfoStep } from './batch-wizard-steps/supplier-info-step'
import { ReceptionInfoStep } from './batch-wizard-steps/reception-info-step'
import { InspectionStep } from './batch-wizard-steps/inspection-step'
import { FinancialCostsStep } from './batch-wizard-steps/financial-costs-step'
import { IncubationAssignmentStep } from './batch-wizard-steps/incubation-assignment-step'
import { ReviewStep } from './batch-wizard-steps/review-step'

const STEPS = [
  { id: 1, title: 'Supplier', description: 'Who supplied the eggs' },
  { id: 2, title: 'Receipt', description: 'Who received them and how many arrived' },
  { id: 3, title: 'Inspection', description: 'Record only exceptions; accepted eggs are calculated' },
  { id: 4, title: 'Costs', description: 'Capture money spent; unit costs are calculated' },
  { id: 5, title: 'Incubator Placement', description: 'Place eggs into available incubator slots automatically' },
  { id: 6, title: 'Review & Submit', description: 'Confirm batch setup' },
]

const BATCH_DRAFT_STORAGE_KEY = 'abbye-batch-creation-draft'

interface BatchWizardProps {
  isOpen: boolean
  defaultIncubationDays?: number
  breedOptions?: string[]
  supplierOptions?: SupplierOption[]
  onClose: () => void
}

type SupplierOption = {
  id: string
  name: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  location?: string | null
}

type BatchDraft = {
  currentStep: number
  workflow: CompleteBatchWorkflow
  savedAt: string
}

function createEmptyWorkflow(): CompleteBatchWorkflow {
  return {
    supplier: {
      supplierName: '',
      contactPerson: '',
      phone: '',
      location: '',
      invoiceNumber: '',
    },
    reception: {
      dateReceived: new Date(),
      receivedByName: '',
      breedType: '',
      totalEggsReceived: 0,
    },
    inspection: {
      crackedEggs: 0,
      dirtyEggs: 0,
      rejectedEggs: 0,
      inspectionStatus: 'PENDING',
    },
    costs: {
      eggPurchaseCost: 0,
      transportCost: 0,
      loadingOffloadingCost: 0,
      miscellaneousCost: 0,
    },
  }
}

function reviveWorkflowDraft(workflow: CompleteBatchWorkflow): CompleteBatchWorkflow {
  return {
    ...workflow,
    reception: {
      ...workflow.reception,
      dateReceived: workflow.reception?.dateReceived
        ? new Date(workflow.reception.dateReceived)
        : new Date(),
    },
    incubationAssignment: workflow.incubationAssignment
      ? {
          ...workflow.incubationAssignment,
          setDate: workflow.incubationAssignment.setDate
            ? new Date(workflow.incubationAssignment.setDate)
            : new Date(),
          expectedHatchDate: workflow.incubationAssignment.expectedHatchDate
            ? new Date(workflow.incubationAssignment.expectedHatchDate)
            : new Date(),
        }
      : undefined,
  }
}

function hasMeaningfulDraft(workflow: CompleteBatchWorkflow, currentStep: number) {
  return (
    currentStep > 1 ||
    Boolean(workflow.supplier.supplierName?.trim()) ||
    Boolean(workflow.supplier.phone?.trim()) ||
    Boolean(workflow.supplier.invoiceNumber?.trim()) ||
    Boolean(workflow.reception.receivedByName?.trim()) ||
    Boolean(workflow.reception.breedType?.trim()) ||
    Number(workflow.reception.totalEggsReceived || 0) > 0 ||
    Number(workflow.inspection.crackedEggs || 0) > 0 ||
    Number(workflow.inspection.dirtyEggs || 0) > 0 ||
    Number(workflow.inspection.rejectedEggs || 0) > 0 ||
    Number(workflow.costs.eggPurchaseCost || 0) > 0 ||
    Number(workflow.costs.transportCost || 0) > 0 ||
    Number(workflow.costs.loadingOffloadingCost || 0) > 0 ||
    Number(workflow.costs.miscellaneousCost || 0) > 0 ||
    Boolean(workflow.incubationAssignment)
  )
}

export function BatchCreationWizard({
  isOpen,
  defaultIncubationDays = 21,
  breedOptions = [],
  supplierOptions = [],
  onClose,
}: BatchWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [createdBatchNumber, setCreatedBatchNumber] = useState<string>('')
  const [uploadWarning, setUploadWarning] = useState<string | null>(null)
  const [inspectionPhotos, setInspectionPhotos] = useState<File[]>([])
  const [draftLoaded, setDraftLoaded] = useState(false)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()

  const [workflow, setWorkflow] = useState<CompleteBatchWorkflow>(() => createEmptyWorkflow())

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedDraft = window.localStorage.getItem(BATCH_DRAFT_STORAGE_KEY)
        if (!storedDraft) {
          setDraftLoaded(true)
          return
        }

        const draft = JSON.parse(storedDraft) as BatchDraft
        if (draft?.workflow) {
          setWorkflow(reviveWorkflowDraft(draft.workflow))
          setCurrentStep(Math.min(Math.max(Number(draft.currentStep || 1), 1), STEPS.length))
        }
      } catch {
        window.localStorage.removeItem(BATCH_DRAFT_STORAGE_KEY)
      } finally {
        setDraftLoaded(true)
      }
    })
  }, [])

  useEffect(() => {
    if (!draftLoaded || success) return

    if (!hasMeaningfulDraft(workflow, currentStep)) {
      window.localStorage.removeItem(BATCH_DRAFT_STORAGE_KEY)
      return
    }

    const draft: BatchDraft = {
      currentStep,
      workflow,
      savedAt: new Date().toISOString(),
    }

    window.localStorage.setItem(BATCH_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [currentStep, draftLoaded, success, workflow])

  const handleStepComplete = useCallback((stepData: any) => {
    setError(null)
    
    // Update workflow based on step
    switch (currentStep) {
      case 1:
        setWorkflow(prev => ({ ...prev, supplier: stepData }))
        break
      case 2:
        setWorkflow(prev => ({ ...prev, reception: stepData }))
        break
      case 3:
        setWorkflow(prev => ({ ...prev, inspection: stepData }))
        break
      case 4:
        setWorkflow(prev => ({ ...prev, costs: stepData }))
        break
      case 5:
        setWorkflow(prev => ({ ...prev, incubationAssignment: stepData }))
        break
    }

    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1)
    }
  }, [currentStep])

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setError(null)
    }
  }

  const handleSubmit = async () => {
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)
    setUploadWarning(null)

    try {
      const result = await createBatch(workflow)

      if (result.success) {
        if (result.batchId && inspectionPhotos.length > 0) {
          const uploadResult = await uploadInspectionPhotos(result.batchId, inspectionPhotos)
          if (uploadResult.failed > 0) {
            setUploadWarning(`Batch created, but ${uploadResult.failed} photo(s) failed to upload.`)
          }
        }
        setSuccess(true)
        setCreatedBatchNumber(result.batchNumber || '')
        window.localStorage.removeItem(BATCH_DRAFT_STORAGE_KEY)
        
        // Close wizard after 2 seconds and refresh
        setTimeout(() => {
          onClose()
          resetWizardState()
          router.refresh()
        }, 2000)
      } else {
        setError(result.error || 'Failed to create batch')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  function resetWizardState() {
    setCurrentStep(1)
    setWorkflow(createEmptyWorkflow())
    setInspectionPhotos([])
    setError(null)
    setSuccess(false)
    setCreatedBatchNumber('')
    setUploadWarning(null)
  }

  function clearDraftState() {
    window.localStorage.removeItem(BATCH_DRAFT_STORAGE_KEY)
    resetWizardState()
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen || loading) return
    setError(null)
    onClose()
  }

  const handleDiscard = () => {
    if (loading) return
    clearDraftState()
    onClose()
  }

  const uploadInspectionPhotos = async (batchId: string, files: File[]) => {
    const supabase = createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      return { uploaded: 0, failed: files.length }
    }

    let uploaded = 0
    let failed = 0

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `batch-attachments/${batchId}/${Date.now()}-${index}-${safeName}`

      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('batch-attachments')
        .upload(filePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })

      if (uploadError || !uploadData?.path) {
        failed += 1
        continue
      }

      const { error: insertError } = await supabase
        .from('batch_attachments')
        .insert({
          batch_id: batchId,
          attachment_type: 'INSPECTION_PHOTO',
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type,
          storage_path: uploadData.path,
          uploaded_by: userData.user.id,
          uploaded_at: new Date().toISOString(),
          sync_version: 1,
        })

      if (insertError) {
        failed += 1
        await supabase.storage.from('batch-attachments').remove([uploadData.path])
        continue
      }

      uploaded += 1
    }

    return { uploaded, failed }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-border bg-popover p-5 sm:max-w-[620px] lg:max-w-[680px]">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground">Create Egg Batch</DialogTitle>
          <DialogDescription className="text-[13px]">
            {success ? 'Batch created successfully' : `Step ${currentStep} of ${STEPS.length}: ${STEPS[currentStep - 1].title}`}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-base font-semibold text-foreground">Batch Created Successfully</h3>
              <p className="text-sm text-muted-foreground">
                Batch: <span className="font-mono font-medium">{createdBatchNumber}</span>
              </p>
              {uploadWarning && (
                <p className="text-xs text-warning">{uploadWarning}</p>
              )}
              <p className="text-xs text-muted-foreground">Redirecting to batches list...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Progress Indicator */}
            <div className="space-y-3 rounded-card border border-border bg-card/50 p-3">
              <div className="flex items-center justify-between gap-2">
                {STEPS.map((step, idx) => (
                  <div key={step.id} className="flex flex-1 items-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                        currentStep > step.id
                          ? 'bg-success text-white'
                          : currentStep === step.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div
                        className={`mx-2 h-px flex-1 ${
                          currentStep > step.id ? 'bg-success' : 'bg-border'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {STEPS[currentStep - 1].description}
              </p>
              {currentStep > 1 && (
                <p className="text-center text-[11px] font-medium text-primary">
                  Draft is saved automatically if this window closes.
                </p>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="mt-4 flex gap-3 rounded-button border border-destructive/20 bg-destructive/10 p-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">{error}</p>
                  <p className="mt-1 text-xs text-destructive/80">Please check your input and try again</p>
                </div>
              </div>
            )}

            {/* Step Content */}
            <div className="py-4">
              {currentStep === 1 && (
                <SupplierInfoStep
                  initialData={workflow.supplier}
                  supplierOptions={supplierOptions}
                  onComplete={handleStepComplete}
                  formId="batch-step-1"
                />
              )}
              {currentStep === 2 && (
                <ReceptionInfoStep
                  initialData={workflow.reception}
                  breedOptions={breedOptions}
                  onComplete={handleStepComplete}
                  formId="batch-step-2"
                />
              )}
              {currentStep === 3 && (
                <InspectionStep
                  initialData={workflow.inspection}
                  totalEggsReceived={workflow.reception.totalEggsReceived}
                  onComplete={handleStepComplete}
                  formId="batch-step-3"
                  photos={inspectionPhotos}
                  onPhotosChange={setInspectionPhotos}
                />
              )}
              {currentStep === 4 && (
                <FinancialCostsStep
                  initialData={workflow.costs}
                  acceptedEggs={workflow.inspection.acceptedEggs}
                  onComplete={handleStepComplete}
                  formId="batch-step-4"
                />
              )}
              {currentStep === 5 && (
                <IncubationAssignmentStep
                  initialData={workflow.incubationAssignment}
                  acceptedEggs={workflow.inspection.acceptedEggs || 0}
                  incubationDays={defaultIncubationDays}
                  onComplete={handleStepComplete}
                  onSkip={() => {
                    setWorkflow(prev => ({ ...prev, incubationAssignment: undefined }))
                    setCurrentStep(currentStep + 1)
                  }}
                  formId="batch-step-5"
                />
              )}
              {currentStep === 6 && (
                <ReviewStep
                  workflow={workflow}
                  photoCount={inspectionPhotos.length}
                />
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between gap-3 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={handlePreviousStep}
                disabled={currentStep === 1 || loading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleOpenChange.bind(null, false)}
                  disabled={loading}
                >
                  Close
                </Button>
                {currentStep > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleDiscard}
                    disabled={loading}
                    className="text-destructive hover:text-destructive"
                  >
                    Discard Draft
                  </Button>
                )}

                {currentStep < STEPS.length && (
                  <Button
                    type="submit"
                    form={`batch-step-${currentStep}`}
                    disabled={loading}
                  >
                    Next
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
                {currentStep === STEPS.length && (
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    aria-busy={loading}
                    className="bg-success text-white hover:bg-success/90"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Create Batch
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
