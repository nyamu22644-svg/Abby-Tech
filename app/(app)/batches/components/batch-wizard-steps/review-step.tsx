'use client'

import { Card } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CompleteBatchWorkflow } from '@/types/batch-workflow.types'

interface ReviewStepProps {
  workflow: CompleteBatchWorkflow
  photoCount: number
}

interface ReviewSectionProps {
  title: string
  children: ReactNode
}

function ReviewSection({ title, children }: ReviewSectionProps) {
  return (
    <Card className="rounded-card border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </Card>
  )
}

function InfoItem({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: React.ReactNode
  emphasis?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={emphasis ? 'truncate text-lg font-semibold text-primary' : 'truncate text-sm font-medium text-foreground'}>
        {value}
      </p>
    </div>
  )
}

function CurrencyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">KES {value.toFixed(2)}</span>
    </div>
  )
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
    <div className="space-y-4">
      <ReviewSection title="Supplier Information">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoItem label="Supplier" value={workflow.supplier.supplierName} />
          <InfoItem label="Contact" value={workflow.supplier.contactPerson || '-'} />
          <InfoItem label="Phone" value={workflow.supplier.phone || '-'} />
          <InfoItem label="Invoice" value={workflow.supplier.invoiceNumber || '-'} />
          <div className="sm:col-span-2">
            <InfoItem label="Location" value={workflow.supplier.location || '-'} />
          </div>
        </div>
      </ReviewSection>

      <ReviewSection title="Reception Details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoItem label="Date Received" value={new Date(workflow.reception.dateReceived).toLocaleString()} />
          <InfoItem label="Received By" value={workflow.reception.receivedByName} />
          <InfoItem label="Breed Type" value={workflow.reception.breedType} />
          <InfoItem label="Total Eggs" value={workflow.reception.totalEggsReceived.toLocaleString()} emphasis />
        </div>
      </ReviewSection>

      <ReviewSection title="Quality Inspection Results">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InfoItem label="Cracked" value={workflow.inspection.crackedEggs.toLocaleString()} />
          <InfoItem label="Dirty" value={workflow.inspection.dirtyEggs.toLocaleString()} />
          <InfoItem label="Rejected" value={workflow.inspection.rejectedEggs.toLocaleString()} />
          <InfoItem label="Rejection Rate" value={`${rejectionRate}%`} />
          <InfoItem label="Photos" value={photoCount.toLocaleString()} />
          <InfoItem label="Accepted Eggs" value={(workflow.inspection.acceptedEggs || 0).toLocaleString()} emphasis />
        </div>
      </ReviewSection>

      <ReviewSection title="Acquisition Costs">
        <div className="space-y-2">
          <CurrencyRow label="Egg Purchase" value={workflow.costs.eggPurchaseCost} />
          <CurrencyRow label="Transport" value={workflow.costs.transportCost} />
          <CurrencyRow label="Loading / Offloading" value={workflow.costs.loadingOffloadingCost} />
          <CurrencyRow label="Miscellaneous" value={workflow.costs.miscellaneousCost} />
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Cost</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">KES {totalCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Cost per Accepted Egg</p>
              <p className="text-lg font-semibold tabular-nums text-primary">KES {costPerEgg.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </ReviewSection>

      {workflow.incubationAssignment && (
        <ReviewSection title="Incubator Placement">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoItem
              label="Incubator"
              value={workflow.incubationAssignment.incubatorName || workflow.incubationAssignment.incubatorId}
            />
            <InfoItem
              label="Technician"
              value={
                workflow.incubationAssignment.responsibleTechnicianName ||
                workflow.incubationAssignment.responsibleTechnician ||
                '-'
              }
            />
            <InfoItem
              label="Actual Set Date"
              value={new Date(workflow.incubationAssignment.setDate).toLocaleString()}
            />
            <InfoItem
              label="Expected Hatch"
              value={new Date(workflow.incubationAssignment.expectedHatchDate).toLocaleString()}
            />
          </div>

          {workflow.incubationAssignment.placementSummary && (
            <p className="mt-3 text-xs text-muted-foreground">
              {workflow.incubationAssignment.placementSummary}
            </p>
          )}

          {workflow.incubationAssignment.allocations && workflow.incubationAssignment.allocations.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {workflow.incubationAssignment.allocations.map((slot) => (
                <div
                  key={`${slot.columnNumber}-${slot.rowNumber}`}
                  className="rounded-button border border-border bg-background px-3 py-2"
                >
                  <p className="text-xs text-muted-foreground">
                    Unit {slot.columnNumber}, Tray {slot.rowNumber}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {slot.eggsAllocated} eggs loaded
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Capacity {slot.slotCapacity}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ReviewSection>
      )}

      <div className="rounded-card border border-primary/20 bg-primary/10 p-4">
        <p className="text-sm font-semibold text-foreground">Ready to Create Batch</p>
        <p className="mt-1 text-xs text-muted-foreground">
          All information has been verified. Create Batch will save the supplier, inspection,
          costs, and placement data for use across the system.
        </p>
      </div>
    </div>
  )
}
