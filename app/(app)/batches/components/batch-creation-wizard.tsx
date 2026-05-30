'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { createBatch } from '../actions'
import { createClient } from '@/lib/supabase/client'
import type { CompleteBatchWorkflow } from '@/types/batch-workflow.types'
import { SupplierInfoStep } from './batch-wizard-steps/supplier-info-step'
import { ReceptionInfoStep } from './batch-wizard-steps/reception-info-step'
import { InspectionStep } from './batch-wizard-steps/inspection-step'
import { FinancialCostsStep } from './batch-wizard-steps/financial-costs-step'
import { IncubationAssignmentStep } from './batch-wizard-steps/incubation-assignment-step'
import { ReviewStep } from './batch-wizard-steps/review-step'

const STEPS = [
  { id: 1, title: 'Supplier Information', description: 'Egg source and delivery details' },
  { id: 2, title: 'Reception Details', description: 'When and how eggs were received' },
  { id: 3, title: 'Quality Inspection', description: 'Inspect and count eggs by condition' },
  { id: 4, title: 'Acquisition Costs', description: 'Calculate total cost per egg' },
  { id: 5, title: 'Incubation Assignment', description: 'Assign to incubator (optional)' },
  { id: 6, title: 'Review & Submit', description: 'Confirm batch setup' },
]

interface BatchWizardProps {
  isOpen: boolean
  onClose: () => void
}

export function BatchCreationWizard({ isOpen, onClose }: BatchWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [createdBatchNumber, setCreatedBatchNumber] = useState<string>('')
  const [uploadWarning, setUploadWarning] = useState<string | null>(null)
  const [inspectionPhotos, setInspectionPhotos] = useState<File[]>([])

  const [workflow, setWorkflow] = useState<CompleteBatchWorkflow>({
    supplier: {
      supplierName: '',
      contactPerson: '',
      phone: '',
      location: '',
      invoiceNumber: '',
    },
    reception: {
      dateReceived: new Date(),
      receivedBy: '',
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
  })

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
        
        // Close wizard after 2 seconds and refresh
        setTimeout(() => {
          onClose()
          router.refresh()
        }, 2000)
      } else {
        setError(result.error || 'Failed to create batch')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading && !success) {
      setCurrentStep(1)
      setWorkflow({
        supplier: { supplierName: '', contactPerson: '', phone: '', location: '', invoiceNumber: '' },
        reception: { dateReceived: new Date(), receivedBy: '', breedType: '', totalEggsReceived: 0 },
        inspection: { crackedEggs: 0, dirtyEggs: 0, rejectedEggs: 0, inspectionStatus: 'PENDING' },
        costs: { eggPurchaseCost: 0, transportCost: 0, loadingOffloadingCost: 0, miscellaneousCost: 0 },
      })
      setInspectionPhotos([])
      setError(null)
      setSuccess(false)
      onClose()
    }
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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Egg Batch</DialogTitle>
          <DialogDescription>
            {success ? 'Batch created successfully' : `Step ${currentStep} of ${STEPS.length}: ${STEPS[currentStep - 1].title}`}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-foreground">Batch Created Successfully</h3>
              <p className="text-sm text-muted-foreground">
                Batch: <span className="font-mono font-medium">{createdBatchNumber}</span>
              </p>
              {uploadWarning && (
                <p className="text-xs text-amber-500">{uploadWarning}</p>
              )}
              <p className="text-xs text-muted-foreground">Redirecting to batches list...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Progress Indicator */}
            <div className="mb-6">
              <div className="flex justify-between mb-4">
                {STEPS.map((step, idx) => (
                  <div key={step.id} className="flex flex-col items-center flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        currentStep > step.id
                          ? 'bg-emerald-500 text-white'
                          : currentStep === step.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {currentStep > step.id ? <CheckCircle2 className="w-4 h-4" /> : step.id}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div
                        className={`flex-1 h-1 mx-2 mt-2 ${
                          currentStep > step.id ? 'bg-emerald-500' : 'bg-muted'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {STEPS[currentStep - 1].description}
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex gap-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3 mb-6">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-500">{error}</p>
                  <p className="text-xs text-red-400/80 mt-1">Please check your input and try again</p>
                </div>
              </div>
            )}

            {/* Step Content */}
            <div className="mb-6 min-h-[300px]">
              {currentStep === 1 && (
                <SupplierInfoStep
                  initialData={workflow.supplier}
                  onComplete={handleStepComplete}
                  formId="batch-step-1"
                />
              )}
              {currentStep === 2 && (
                <ReceptionInfoStep
                  initialData={workflow.reception}
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
            <div className="flex gap-3 justify-between">
              <Button
                variant="outline"
                onClick={handlePreviousStep}
                disabled={currentStep === 1 || loading}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Cancel
                </Button>

                {currentStep < STEPS.length && (
                  <Button
                    type="submit"
                    form={`batch-step-${currentStep}`}
                    disabled={loading}
                  >
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
                {currentStep === STEPS.length && (
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
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
