'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2 } from 'lucide-react'
import type { CompleteBatchWorkflow } from '@/types/batch-workflow.types'

interface ReviewStepProps {
  workflow: CompleteBatchWorkflow
  photoCount: number
}

export function ReviewStep({ workflow, photoCount }: ReviewStepProps) {
  const totalCost =
    workflow.costs.eggPurchaseCost +
    workflow.costs.transportCost +
    workflow.costs.loadingOffloadingCost +
    workflow.costs.miscellaneousCost

  const costPerEgg =
    workflow.inspection.acceptedEggs && workflow.inspection.acceptedEggs > 0
      ? totalCost / workflow.inspection.acceptedEggs
      : 0

  const rejectedCount =
    workflow.inspection.crackedEggs +
    workflow.inspection.dirtyEggs +
    workflow.inspection.rejectedEggs

  const rejectionRate =
    workflow.reception.totalEggsReceived > 0
      ? ((rejectedCount / workflow.reception.totalEggsReceived) * 100).toFixed(1)
      : '0'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        {/* Supplier Section */}
        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-500" />
              Supplier Information
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Supplier</p>
              <p className="font-medium">{workflow.supplier.supplierName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contact</p>
              <p className="font-medium">{workflow.supplier.contactPerson}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="font-medium">{workflow.supplier.phone}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invoice</p>
              <p className="font-medium">{workflow.supplier.invoiceNumber}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="font-medium">{workflow.supplier.location}</p>
            </div>
          </div>
        </Card>

        {/* Reception Section */}
        <Card className="p-4 border-l-4 border-l-cyan-500">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-500" />
              Reception Details
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Date Received</p>
              <p className="font-medium">
                {new Date(workflow.reception.dateReceived).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Received By</p>
              <p className="font-medium">{workflow.reception.receivedBy}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Breed Type</p>
              <p className="font-medium">{workflow.reception.breedType}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Eggs</p>
              <p className="font-medium text-lg text-blue-600 dark:text-blue-400">
                {workflow.reception.totalEggsReceived}
              </p>
            </div>
          </div>
        </Card>

        {/* Inspection Section */}
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-500" />
              Quality Inspection Results
            </h3>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Cracked Eggs</p>
                <p className="font-medium text-lg">{workflow.inspection.crackedEggs}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dirty Eggs</p>
                <p className="font-medium text-lg">{workflow.inspection.dirtyEggs}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Other Rejected</p>
                <p className="font-medium text-lg">{workflow.inspection.rejectedEggs}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rejection Rate</p>
                <p className="font-medium text-lg">{rejectionRate}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Inspection Photos</p>
                <p className="font-medium text-lg">{photoCount}</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded p-3">
              <p className="text-xs text-muted-foreground">Accepted Eggs (For Incubation)</p>
              <p className="font-bold text-2xl text-emerald-600 dark:text-emerald-400">
                {workflow.inspection.acceptedEggs || 0}
              </p>
            </div>
          </div>
        </Card>

        {/* Financial Section */}
        <Card className="p-4 border-l-4 border-l-violet-500">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-violet-500" />
              Acquisition Costs
            </h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Egg Purchase</span>
              <span className="font-medium">KES {workflow.costs.eggPurchaseCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Transport</span>
              <span className="font-medium">KES {workflow.costs.transportCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Loading/Offloading</span>
              <span className="font-medium">
                KES {workflow.costs.loadingOffloadingCost.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Miscellaneous</span>
              <span className="font-medium">
                KES {workflow.costs.miscellaneousCost.toFixed(2)}
              </span>
            </div>
            <div className="border-t border-input pt-2 mt-2 flex justify-between font-bold">
              <span>Total Cost</span>
              <span className="text-violet-600 dark:text-violet-400">
                KES {totalCost.toFixed(2)}
              </span>
            </div>
            <div className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20 rounded p-2 mt-2">
              <p className="text-xs text-muted-foreground">Cost per Accepted Egg</p>
              <p className="font-bold text-lg text-orange-600 dark:text-orange-400">
                KES {costPerEgg.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        {/* Incubation Section (if assigned) */}
        {workflow.incubationAssignment && (
          <Card className="p-4 border-l-4 border-l-green-500">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Incubation Assignment
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Incubator</p>
                <p className="font-medium">{workflow.incubationAssignment.incubatorId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Technician</p>
                <p className="font-medium">
                  {workflow.incubationAssignment.responsibleTechnician || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Set Date</p>
                <p className="font-medium">
                  {new Date(workflow.incubationAssignment.setDate).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expected Hatch</p>
                <p className="font-medium">
                  {new Date(workflow.incubationAssignment.expectedHatchDate).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-4">
        <p className="text-sm text-foreground font-medium">Ready to Create Batch</p>
        <p className="text-xs text-muted-foreground mt-2">
          All information has been verified. Click "Create Batch" to save this batch and begin tracking.
        </p>
      </div>
    </div>
  )
}
