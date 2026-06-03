-- Pre-live cleanup for removing test/demo operational rows.
--
-- This migration intentionally keeps schema, migrations, auth users, tenant,
-- roles, permissions, user profiles, business settings, phase definitions, and
-- expense category definitions intact.
--
-- Before deleting rows from public operational tables, it copies every public
-- table into the backup schema below so the removed rows can be restored from
-- the same remote database if needed.

CREATE SCHEMA IF NOT EXISTS pre_live_cleanup_backup_20260603;

DO $$
DECLARE
    r record;
    row_count bigint;
BEGIN
    CREATE TABLE IF NOT EXISTS pre_live_cleanup_backup_20260603.row_counts_before (
        table_name text PRIMARY KEY,
        row_count bigint NOT NULL,
        captured_at timestamptz NOT NULL DEFAULT now()
    );

    TRUNCATE pre_live_cleanup_backup_20260603.row_counts_before;

    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS pre_live_cleanup_backup_20260603.%I', r.tablename);
        EXECUTE format('CREATE TABLE pre_live_cleanup_backup_20260603.%I AS TABLE public.%I', r.tablename, r.tablename);
        EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO row_count;

        INSERT INTO pre_live_cleanup_backup_20260603.row_counts_before (table_name, row_count)
        VALUES (r.tablename, row_count);

        RAISE NOTICE 'pre-live backup: copied %.% rows: %', 'public', r.tablename, row_count;
    END LOOP;
END $$;

DELETE FROM audit_log_changes;
DELETE FROM audit_logs;
DELETE FROM sync_conflicts;
DELETE FROM sync_outbox;
DELETE FROM notifications;
DELETE FROM system_events;
DELETE FROM alert_events;
DELETE FROM alert_rules;
DELETE FROM telemetry_ingest_queue;
DELETE FROM device_readings;
DELETE FROM incubator_environmental_logs;
DELETE FROM batch_incubator_allocations;
DELETE FROM batch_acquisition_costs;
DELETE FROM batch_incubation_assignments;
DELETE FROM batch_attachments;
DELETE FROM batch_inspection_records;
DELETE FROM hatch_results;
DELETE FROM mortality_events;
DELETE FROM batch_phase_events;
DELETE FROM order_dispatches;
DELETE FROM order_payments;
DELETE FROM order_items;
DELETE FROM cost_entries;
DELETE FROM profitability_snapshots;
DELETE FROM reservations;
DELETE FROM orders;
DELETE FROM customers;
DELETE FROM operational_logs;
DELETE FROM egg_batches;
DELETE FROM incubator_maintenance_logs;
DELETE FROM device_assignments;
DELETE FROM suppliers;
DELETE FROM incubators;
DELETE FROM devices;
DELETE FROM sequence_counters;

DO $$
DECLARE
    r record;
    row_count bigint;
BEGIN
    CREATE TABLE IF NOT EXISTS pre_live_cleanup_backup_20260603.row_counts_after (
        table_name text PRIMARY KEY,
        row_count bigint NOT NULL,
        captured_at timestamptz NOT NULL DEFAULT now()
    );

    TRUNCATE pre_live_cleanup_backup_20260603.row_counts_after;

    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO row_count;

        INSERT INTO pre_live_cleanup_backup_20260603.row_counts_after (table_name, row_count)
        VALUES (r.tablename, row_count);

        RAISE NOTICE 'pre-live cleanup: remaining %.% rows: %', 'public', r.tablename, row_count;
    END LOOP;
END $$;
