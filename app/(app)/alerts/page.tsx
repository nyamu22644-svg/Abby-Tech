import { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Alerts | Smart Hatchery OS',
  description: 'System alerts and operational warnings.',
};

export default function AlertsPage() {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">System Alerts</h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-tight">
            Telemetry deviations, hardware failures, and workflow warnings.
          </p>
        </div>
      </div>

      <Card className="border-border shadow-sm rounded-lg overflow-hidden bg-card">
        <div className="p-16 text-center max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4 border border-success/20">
            <ShieldCheck className="w-8 h-8 text-success" />
          </div>
          <h3 className="text-lg font-medium text-primary tracking-tight mb-2">Systems Nominal</h3>
          <p className="text-sm text-muted-foreground">
            There are currently no active alerts. All incubators and parameters are operating within standard thresholds.
          </p>
        </div>
      </Card>
      
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-muted-foreground mb-3 uppercase">Alert History</h3>
        <Card className="border-border shadow-sm bg-card p-8 text-center text-sm text-muted-foreground">
          No historical alerts found.
        </Card>
      </div>
    </div>
  );
}
