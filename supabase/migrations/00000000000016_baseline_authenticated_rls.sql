-- Baseline production data protection.
-- This blocks unauthenticated PostgREST access to operational tables.
-- It is intentionally broad for authenticated users; role/tenant-specific
-- policies can be tightened after the first production rollout.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE incubators ENABLE ROW LEVEL SECURITY;
ALTER TABLE incubator_maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE egg_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE incubator_environmental_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_phase_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_phase_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hatch_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE mortality_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE profitability_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_ingest_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_inspection_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_incubation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_acquisition_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_incubator_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated access tenants" ON tenants
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access business_settings" ON business_settings
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access sequence_counters" ON sequence_counters
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access roles" ON roles
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access permissions" ON permissions
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access role_permissions" ON role_permissions
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access user_profiles" ON user_profiles
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access user_roles" ON user_roles
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access devices" ON devices
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access device_metrics" ON device_metrics
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access suppliers" ON suppliers
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access customers" ON customers
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access incubators" ON incubators
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access incubator_maintenance_logs" ON incubator_maintenance_logs
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access device_assignments" ON device_assignments
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access egg_batches" ON egg_batches
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access incubator_environmental_logs" ON incubator_environmental_logs
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access batch_phase_definitions" ON batch_phase_definitions
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access batch_phase_events" ON batch_phase_events
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access hatch_results" ON hatch_results
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access mortality_events" ON mortality_events
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access operational_logs" ON operational_logs
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access reservations" ON reservations
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access orders" ON orders
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access order_items" ON order_items
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access order_payments" ON order_payments
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access order_dispatches" ON order_dispatches
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access expense_categories" ON expense_categories
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access cost_entries" ON cost_entries
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access profitability_snapshots" ON profitability_snapshots
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access device_readings" ON device_readings
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access telemetry_ingest_queue" ON telemetry_ingest_queue
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access alert_rules" ON alert_rules
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access alert_events" ON alert_events
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access notifications" ON notifications
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access system_events" ON system_events
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access audit_logs" ON audit_logs
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access audit_log_changes" ON audit_log_changes
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access sync_outbox" ON sync_outbox
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access sync_conflicts" ON sync_conflicts
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access batch_inspection_records" ON batch_inspection_records
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access batch_attachments" ON batch_attachments
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access batch_incubation_assignments" ON batch_incubation_assignments
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access batch_acquisition_costs" ON batch_acquisition_costs
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access batch_incubator_allocations" ON batch_incubator_allocations
FOR ALL TO authenticated USING (true) WITH CHECK (true);
