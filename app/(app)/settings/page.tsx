import { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { Settings, Users, Monitor, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Settings | Smart Hatchery OS',
  description: 'Manage users, roles, and facility configuration.',
};

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Platform Settings</h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-tight">
            Configure hatchery defaults, telemetry hardware, and access controls.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button className="h-9 px-4 rounded-md font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
            Save Configuration
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium bg-muted text-primary rounded-md">
            <Settings className="w-4 h-4" /> General
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 rounded-md transition-colors">
            <Users className="w-4 h-4" /> Team & Roles
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 rounded-md transition-colors">
            <Monitor className="w-4 h-4" /> Hardware & Sensors
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 rounded-md transition-colors">
            <Shield className="w-4 h-4" /> Security
          </button>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <Card className="border-border shadow-sm bg-card p-6">
            <h3 className="text-lg font-medium text-primary tracking-tight mb-4">Facility Details</h3>
            <div className="space-y-4 max-w-md">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Facility Name</label>
                <input type="text" placeholder="Enter facility name" className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Default Incubation Cycle (Days)</label>
                <input type="number" placeholder="21" className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
