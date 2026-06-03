'use client'

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Egg, Activity, CheckCircle2, Plus, Loader2, Archive, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BatchCreationWizard } from './components/batch-creation-wizard';
import { BatchActionsMenu } from './components/batch-actions-menu';
import { PlaceBatchDialog } from './components/place-batch-dialog';
import { createClient } from '@/lib/supabase/client';

export default function EggBatchesPage() {
  const [batches, setBatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'active' | 'completed' | 'archived' | 'all'>('active')
  const [wizardOpen, setWizardOpen] = useState(false)

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    setFetchError(null)

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setBatches([])
      setFetchError('Supabase is not configured locally. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart npm run dev.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    let query = supabase
        .from('egg_batches')
        .select('*, suppliers(name)')
        .order('created_at', { ascending: false })

    if (viewMode === 'active' || viewMode === 'completed') {
      query = query.is('deleted_at', null)
    }

    if (viewMode === 'archived') {
      query = query.not('deleted_at', 'is', null)
    }

    const { data, error } = await query

    if (error) {
      setBatches([])
      setFetchError(error.message)
    } else {
      setBatches(data || [])
    }

    setLoading(false)
  }, [viewMode])

  useEffect(() => {
    queueMicrotask(() => {
      fetchBatches()
    })
  }, [fetchBatches])

  const currentStatuses = new Set(['LOGGED', 'SETTER', 'HATCHER', 'BROODER'])
  const completedStatuses = new Set(['COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED'])
  const displayBatches = (batches || []).filter((batch) => {
    if (viewMode === 'active') return currentStatuses.has(batch.status || '')
    if (viewMode === 'completed') return completedStatuses.has(batch.status || '')
    return true
  });
  const emptyMessage = viewMode === 'archived'
    ? 'No archived batches found.'
    : viewMode === 'completed'
      ? 'No completed or closed batches found.'
    : viewMode === 'all'
      ? 'No egg batches found in active or archived records.'
      : 'No active operational batches found. Completed cycles are under Completed.';

  const hasPlacementGap = (batch: any) => (
    ['SETTER', 'HATCHER'].includes(batch.status) &&
    (!batch.incubator_id || !batch.set_date || !batch.expected_hatch_date)
  )

  const getIncubatingEggs = (batch: any) => {
    if (!['SETTER', 'HATCHER'].includes(batch.status) || hasPlacementGap(batch)) return 0
    return Number(batch.quantity_set ?? batch.accepted_eggs ?? 0)
  }

  const activeIncubating = displayBatches.filter(b => ['SETTER', 'HATCHER'].includes(b.status) && !hasPlacementGap(b)).length;
  const activeSetters = displayBatches.filter(b => b.status === 'SETTER' && !hasPlacementGap(b)).length;
  const activeHatchers = displayBatches.filter(b => b.status === 'HATCHER').length;
  const needsPlacement = displayBatches.filter(hasPlacementGap).length;
  const totalVolume = displayBatches.reduce(
    (acc, b) => acc + getIncubatingEggs(b),
    0
  );

  const formatDate = (value?: string | null) => {
    if (!value) return '--'
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleDateString()
  }

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      
      {/* Header Section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Egg Batches</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Active incubation cycles and inventory tracking
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-button border border-border bg-card p-1 shadow-[var(--shadow-card)]">
            {[
              { key: 'active', label: 'Active' },
              { key: 'completed', label: 'Completed' },
              { key: 'archived', label: 'Archived' },
              { key: 'all', label: 'All' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setViewMode(item.key as 'active' | 'archived' | 'all')}
                className={cn(
                  'h-8 rounded-button px-3 text-[13px] font-medium transition-colors',
                  viewMode === item.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button 
            onClick={() => setWizardOpen(true)}
            className="h-9 gap-2 rounded-button bg-primary px-4 font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Batch
          </Button>
        </div>
      </div>

      {viewMode === 'archived' && (
        <div className="flex items-center gap-2 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <Archive className="h-4 w-4 shrink-0" />
          <span>
            Archived batches are soft-deleted records. Restore them to return them to active operations.
          </span>
        </div>
      )}
      {viewMode === 'completed' && (
        <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Completed batches are closed production cycles. They are kept for history, costing, hatch results, and order traceability.
          </span>
        </div>
      )}

      {/* Operational Highlights */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="min-h-[138px] p-[18px]">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_12px_24px_rgba(22,119,255,0.28)]">
              <Egg className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground">In Incubator</div>
              <div className="mt-1.5 text-3xl font-semibold leading-none tracking-tight text-foreground">
                {activeIncubating}
              </div>
            </div>
          </div>
          <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            Active placed batches
          </div>
        </Card>

        <Card className="min-h-[138px] border-warning/30 p-[18px]">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-warning text-slate-950 shadow-[0_12px_24px_rgba(251,191,36,0.24)]">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground">Needs Placement</div>
              <div className="mt-1.5 text-3xl font-semibold leading-none tracking-tight text-warning">
                {needsPlacement}
              </div>
            </div>
          </div>
          <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-warning" />
            Waiting for slot assignment
          </div>
        </Card>
        
        <Card className="min-h-[138px] p-[18px]">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive text-white shadow-[0_12px_24px_rgba(255,59,92,0.24)]">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground">Setter / Hatcher</div>
              <div className="mt-1.5 text-3xl font-semibold leading-none tracking-tight text-foreground">
                {activeSetters} / {activeHatchers}
              </div>
            </div>
          </div>
          <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            Incubator stage split
          </div>
        </Card>

        <Card className="min-h-[138px] p-[18px]">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success text-white shadow-[0_12px_24px_rgba(45,212,111,0.22)]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground">Currently Incubating</div>
              <div className="mt-1.5 text-3xl font-semibold leading-none tracking-tight text-foreground">
                {totalVolume.toLocaleString()}
              </div>
            </div>
          </div>
          <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            Setter and hatcher eggs only
          </div>
        </Card>
      </div>

      {/* Main Content Area */}
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/20 p-3">
          <div className="flex h-9 w-full max-w-sm items-center gap-2 rounded-input border border-border bg-background px-3 shadow-sm transition-all focus-within:ring-4 focus-within:ring-primary/10">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input 
              type="text" 
              placeholder="Filter by batch number or supplier..." 
              className="w-full border-none bg-transparent text-[13px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">Batch ID</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">Supplier</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide">Received</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide">Accepted</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">Inspection</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">Set Date</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">Est. Hatch</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">State</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading batches...
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-destructive">
                    Failed to load batches: {fetchError}
                  </td>
                </tr>
              ) : displayBatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : displayBatches.map((batch: any) => (
                <tr key={batch.id} className={cn("hover:bg-muted/30 transition-colors group", batch.deleted_at && "opacity-75")}>
                  <td className="px-5 py-3 font-mono text-[13px] text-primary whitespace-nowrap">
                    <Link href={`/batches/${batch.id}`} className="hover:underline">
                      {batch.batch_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground font-medium">
                    {batch.suppliers?.name || batch.contact_person || '--'}
                  </td>
                  <td className="px-5 py-3 text-primary tracking-tight font-medium text-right tabular-nums">
                    {batch.quantity_received?.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-primary tracking-tight font-medium text-right tabular-nums">
                    {(batch.accepted_eggs ?? '--') === '--' ? '--' : Number(batch.accepted_eggs).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground font-medium whitespace-nowrap">
                    {batch.inspection_status || 'PENDING'}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground font-medium whitespace-nowrap tabular-nums">
                    {formatDate(batch.set_date)}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground font-medium whitespace-nowrap tabular-nums">
                    {formatDate(batch.expected_hatch_date)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={batch.status} hasPlacementGap={hasPlacementGap(batch)} />
                      {hasPlacementGap(batch) && (
                        <PlaceBatchDialog
                          batchId={batch.id}
                          batchNumber={batch.batch_number}
                          acceptedEggs={Number(batch.accepted_eggs || 0)}
                          onPlaced={fetchBatches}
                        />
                      )}
                      {batch.deleted_at && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Archived
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right w-14">
                    <BatchActionsMenu 
                      batchId={batch.id} 
                      isArchived={Boolean(batch.deleted_at)}
                      onDelete={() => setBatches(batches.filter(b => b.id !== batch.id))}
                      onRestore={() => setBatches(batches.filter(b => b.id !== batch.id))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Batch Creation Wizard Modal */}
      <BatchCreationWizard 
        isOpen={wizardOpen}
        onClose={() => {
          setWizardOpen(false)
          fetchBatches()
        }}
      />
    </div>
  );
}

function StatusBadge({ status, hasPlacementGap = false }: { status: string; hasPlacementGap?: boolean }) {
  const label = hasPlacementGap ? 'NEEDS PLACEMENT' : status === 'SETTER' ? 'IN INCUBATOR' : status;

  return (
    <span className={cn(
      "inline-flex items-center rounded-button border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
      status === 'LOGGED' && "bg-muted text-muted-foreground border-border",
      status === 'SETTER' && !hasPlacementGap && "bg-status-setter text-status-setter-text border-status-setter/50",
      status === 'HATCHER' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'BROODER' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'COMPLETED' && "bg-status-completed text-status-completed-text border-status-completed/50",
      status === 'FAILED' && "bg-destructive/10 text-destructive border-destructive/20",
      status === 'DISCARDED' && "bg-destructive/10 text-destructive border-destructive/20",
      status === 'CANCELLED' && "bg-muted/50 text-muted-foreground border-border",
      hasPlacementGap && "bg-warning/10 text-warning border-warning/30",
      !['LOGGED', 'SETTER', 'HATCHER', 'BROODER', 'COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED'].includes(status) && "bg-muted text-muted-foreground border-border"
    )}>
      {label}
    </span>
  );
}
