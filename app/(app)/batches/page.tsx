'use client'

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Filter, Egg, Activity, CheckCircle2, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BatchCreationWizard } from './components/batch-creation-wizard';
import { BatchActionsMenu } from './components/batch-actions-menu';
import { createClient } from '@/lib/supabase/client';

export default function EggBatchesPage() {
  const [batches, setBatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    const fetchBatches = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('egg_batches')
        .select('*, suppliers(name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (data) {
        setBatches(data)
      }
      setLoading(false)
    }

    fetchBatches()
  }, [])

  const displayBatches = batches || [];

  const activeSetters = displayBatches.filter(b => b.status === 'SETTER').length;
  const activeHatchers = displayBatches.filter(b => b.status === 'HATCHER').length;
  const totalVolume = displayBatches.reduce(
    (acc, b) => acc + (!['DISCARDED', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(b.status) ? (b.quantity_received || 0) : 0),
    0
  );

  const formatDate = (value?: string | null) => {
    if (!value) return '—'
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString()
  }

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Egg Batches</h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-tight">
            Active incubation cycles and inventory tracking
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2 h-9 px-4 rounded-md font-medium text-secondary-foreground border-border bg-card hover:bg-muted/50 shadow-sm">
            <Filter className="h-4 w-4" />
            Filter View
          </Button>
          <Button 
            onClick={() => setWizardOpen(true)}
            className="gap-2 h-9 px-4 rounded-md font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Batch
          </Button>
        </div>
      </div>

      {/* Operational Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 border-border shadow-sm flex flex-col justify-between bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-4">
            <span className="text-sm font-medium tracking-tight">Active Setters</span>
            <Egg className="w-4 h-4" />
          </div>
          <div>
            <span className="text-3xl font-semibold text-primary">{activeSetters}</span>
            <span className="text-sm font-medium text-muted-foreground ml-2">batches</span>
          </div>
        </Card>
        
        <Card className="p-5 border-border shadow-sm flex flex-col justify-between bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-4">
            <span className="text-sm font-medium tracking-tight">Active Hatchers</span>
            <Activity className="w-4 h-4 text-status-hatcher-text" />
          </div>
          <div>
            <span className="text-3xl font-semibold text-primary">{activeHatchers}</span>
            <span className="text-sm font-medium text-muted-foreground ml-2">batches</span>
          </div>
        </Card>

        <Card className="p-5 border-border shadow-sm flex flex-col justify-between bg-card relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-success/5 rounded-bl-full -mr-8 -mt-8 z-0"></div>
          <div className="flex items-center justify-between text-muted-foreground mb-4 relative z-10">
            <span className="text-sm font-medium tracking-tight">Total Incubating Volume</span>
            <CheckCircle2 className="w-4 h-4 text-success" />
          </div>
          <div className="relative z-10">
            <span className="text-3xl font-semibold text-primary tabular-nums tracking-tight">
              {totalVolume.toLocaleString()}
            </span>
            <span className="text-sm font-medium text-muted-foreground ml-2">eggs</span>
          </div>
        </Card>
      </div>

      {/* Main Content Area */}
      <Card className="border-border shadow-sm rounded-lg overflow-hidden bg-card">
        <div className="p-3 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2 w-full max-w-sm px-3 py-1.5 bg-background border border-border rounded-md focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-sm">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input 
              type="text" 
              placeholder="Filter by batch number or supplier..." 
              className="bg-transparent border-none focus:outline-none text-sm w-full placeholder:text-muted-foreground font-medium text-foreground"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-5 py-3.5 tracking-tight font-medium text-[13px] uppercase">Batch ID</th>
                <th className="px-5 py-3.5 tracking-tight font-medium text-[13px] uppercase">Supplier</th>
                <th className="px-5 py-3.5 tracking-tight font-medium text-[13px] uppercase text-right">Received</th>
                <th className="px-5 py-3.5 tracking-tight font-medium text-[13px] uppercase text-right">Accepted</th>
                <th className="px-5 py-3.5 tracking-tight font-medium text-[13px] uppercase">Inspection</th>
                <th className="px-5 py-3.5 tracking-tight font-medium text-[13px] uppercase">Set Date</th>
                <th className="px-5 py-3.5 tracking-tight font-medium text-[13px] uppercase">Est. Hatch</th>
                <th className="px-5 py-3.5 tracking-tight font-medium text-[13px] uppercase">State</th>
                <th className="px-5 py-3.5 tracking-tight font-medium text-[13px] uppercase text-right">Actions</th>
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
              ) : displayBatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">
                    No egg batches found. Create a new batch to track inventory.
                  </td>
                </tr>
              ) : displayBatches.map((batch: any) => (
                <tr key={batch.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-5 py-3.5 font-mono text-[13px] text-primary whitespace-nowrap">
                    <Link href={`/batches/${batch.id}`} className="hover:underline">
                      {batch.batch_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground font-medium">
                    {batch.suppliers?.name || batch.contact_person || '—'}
                  </td>
                  <td className="px-5 py-3.5 text-primary tracking-tight font-medium text-right tabular-nums">
                    {batch.quantity_received?.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-primary tracking-tight font-medium text-right tabular-nums">
                    {(batch.accepted_eggs ?? '—') === '—' ? '—' : Number(batch.accepted_eggs).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground font-medium whitespace-nowrap">
                    {batch.inspection_status || 'PENDING'}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground font-medium whitespace-nowrap tabular-nums">
                    {formatDate(batch.set_date)}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground font-medium whitespace-nowrap tabular-nums">
                    {formatDate(batch.expected_hatch_date)}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right w-14">
                    <BatchActionsMenu 
                      batchId={batch.id} 
                      onDelete={() => setBatches(batches.filter(b => b.id !== batch.id))}
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
        onClose={() => setWizardOpen(false)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-semibold tracking-wide uppercase border",
      status === 'LOGGED' && "bg-muted text-muted-foreground border-border",
      status === 'SETTER' && "bg-status-setter text-status-setter-text border-status-setter/50",
      status === 'HATCHER' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'BROODER' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'COMPLETED' && "bg-status-completed text-status-completed-text border-status-completed/50",
      status === 'FAILED' && "bg-destructive/10 text-destructive border-destructive/20",
      status === 'DISCARDED' && "bg-destructive/10 text-destructive border-destructive/20",
      status === 'CANCELLED' && "bg-muted/50 text-muted-foreground border-border",
      !['LOGGED', 'SETTER', 'HATCHER', 'BROODER', 'COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED'].includes(status) && "bg-muted text-muted-foreground border-border"
    )}>
      {status}
    </span>
  );
}
