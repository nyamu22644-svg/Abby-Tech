import { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { Activity, Thermometer, ThermometerSun, AlertTriangle, ArrowUpRight, ArrowDownRight, Wind, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Dashboard | Smart Hatchery OS',
  description: 'Operational overview of hatchery performance.',
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { count: activeSetters } = await supabase.from('egg_batches').select('*', { count: 'exact', head: true }).in('status', ['EARLY_INCUBATION', 'CANDLING', 'LOCKDOWN']);
  const { count: activeHatchers } = await supabase.from('egg_batches').select('*', { count: 'exact', head: true }).in('status', ['LOCKDOWN', 'HATCHING']);
  
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Operational Overview</h1>
        <p className="text-sm text-muted-foreground mt-1 tracking-tight">
          Current facility telemetry and high-level KPIs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <Card className="p-5 border-border shadow-sm bg-card relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-8 -mt-8 z-0"></div>
          <div className="flex items-center justify-between text-muted-foreground mb-4 relative z-10">
            <span className="text-sm font-medium tracking-tight">Active Setters</span>
            <ThermometerSun className="w-4 h-4 text-primary" />
          </div>
          <div className="relative z-10 space-y-1">
            <span className="text-3xl font-semibold text-primary tabular-nums">{activeSetters || 0}</span>
            <div className="flex items-center text-xs font-medium text-success">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              <span>Normal parameters</span>
            </div>
          </div>
        </Card>

        {/* KPI 2 */}
        <Card className="p-5 border-border shadow-sm bg-card relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-status-hatcher/10 rounded-bl-full -mr-8 -mt-8 z-0"></div>
          <div className="flex items-center justify-between text-muted-foreground mb-4 relative z-10">
            <span className="text-sm font-medium tracking-tight">Active Hatchers</span>
            <Activity className="w-4 h-4 text-status-hatcher-text" />
          </div>
          <div className="relative z-10 space-y-1">
            <span className="text-3xl font-semibold text-primary tabular-nums">{activeHatchers || 0}</span>
            <div className="flex items-center text-xs font-medium text-success">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              <span>Normal parameters</span>
            </div>
          </div>
        </Card>

        {/* KPI 3 */}
        <Card className="p-5 border-border shadow-sm bg-card relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground mb-4">
            <span className="text-sm font-medium tracking-tight">Current Yield Estimate</span>
            <Wind className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <span className="text-3xl font-semibold text-primary tabular-nums">84.2%</span>
            <div className="flex items-center text-xs font-medium text-destructive">
              <ArrowDownRight className="w-3 h-3 mr-1" />
              <span>-1.2% from last cycle</span>
            </div>
          </div>
        </Card>

        {/* KPI 4 */}
        <Card className="p-5 border-border shadow-sm bg-card relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground mb-4">
            <span className="text-sm font-medium tracking-tight">Active Alerts</span>
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div className="space-y-1">
            <span className="text-3xl font-semibold text-primary tabular-nums">0</span>
            <div className="flex items-center text-xs font-medium text-muted-foreground">
              <span>All systems optimal</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Telemetry Chart Area (Placeholder for structure) */}
        <Card className="lg:col-span-2 border-border shadow-sm bg-card flex flex-col">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h3 className="font-medium tracking-tight text-primary">Setter Bay Telemetry</h3>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-success/10 text-success border border-success/20">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              LIVE
            </span>
          </div>
          <div className="p-5 flex-1 min-h-[300px] flex items-center justify-center border-b border-border/50 bg-muted/10">
            {/* We can use recharts here if requested, but for now we'll put a structured placeholder */}
            <div className="text-center space-y-2">
              <Zap className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground font-medium">Connecting to generic telemetry visualizers...</p>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="p-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1 tracking-wider uppercase">Avg Temp</p>
              <p className="text-lg font-semibold text-primary font-mono">37.5°C</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1 tracking-wider uppercase">Humidity</p>
              <p className="text-lg font-semibold text-primary font-mono">75%</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1 tracking-wider uppercase">CO2 Level</p>
              <p className="text-lg font-semibold text-primary font-mono">400ppm</p>
            </div>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="border-border shadow-sm bg-card">
          <div className="p-5 border-b border-border">
            <h3 className="font-medium tracking-tight text-primary">Recent Activity</h3>
          </div>
          <div className="p-0">
            <div className="divide-y divide-border">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-4 flex gap-4 hover:bg-muted/30 transition-colors">
                  <div className="mt-0.5 shrink-0">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-status-setter border border-status-setter-text/30"></div>
                  </div>
                  <div>
                    <p className="text-sm text-primary font-medium">Batch BCH-00{i} transferred to Hatcher Bay 2</p>
                    <p className="text-xs text-muted-foreground mt-1">2 hours ago • Automated</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
