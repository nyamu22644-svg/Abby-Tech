# Abby Tech Smart Hatchery Platform
## Database Architecture Specification

This document details the PostgreSQL schema designed for the Abby Tech Smart Hatchery Platform, tailored specifically for Supabase deployment. It incorporates enterprise-grade standards, offline-first considerations, and robust traceability.

### 1. Architectural Reasoning & Standards

*   **UUID Strategy**: Every table uses UUIDv4 (`gen_random_uuid()`) for primary keys. This is critical for our offline-first capability, allowing clients (workers with tablets/phones) to generate records while offline without ID collision when syncing later.
*   **Naming Conventions**:
    *   Tables and Columns: `snake_case` (e.g., `egg_batches`, `hatch_date`).
    *   Foreign Keys: `target_table_id_fkey` suffix.
*   **Audit Logging Strategy**: A dedicated `audit_logs` schema/table captures historical `INSERT`, `UPDATE`, and `DELETE` operations using PostgreSQL triggers.
*   **Soft Delete**: Core operational tables implement soft deletion (`deleted_at TIMESTAMP`) to preserve historical integrity, especially for financial and batch records. We avoid physical deletions.
*   **Offline Synchronization**: Tables edited offline include `updated_at`, `version` (integer), and `last_synced_at` columns. A sync-conflict resolution strategy relies on `last_synced_at` and `updated_at`.
*   **Multi-tenant Future Scalability**: We include a `tenant_id` field (nullable for the single-tenant MVP, explicitly used in Phase 2) on all major entities to allow SaaS expansion later without a schema rewrite.
*   **State-Machine Workflow**: The lifecycle of eggs and chicks uses discrete enum constraints (`PENDING`, `INCUBATING`, `BROODING`, `SOLD`, `FAILED`) enforced at the database level.

---

### 2. Schema Definitions

#### Schema: `auth` (Managed by Supabase)
We rely on Supabase's `auth.users` table for authentication. We link to this via our `public.profiles` table.

#### Schema: `public` (Core Business Logic)

**`profiles` (User Management & RBAC)**
*   `id` (UUID, PK) - references `auth.users(id)`
*   `tenant_id` (UUID, FK, Nullable)
*   `role` (ENUM: `SUPER_ADMIN`, `MANAGER`, `TECHNICIAN`, `WORKER`)
*   `first_name` (VARCHAR)
*   `last_name` (VARCHAR)
*   `phone_number` (VARCHAR) - Important for local Kenyan context (M-Pesa/SMS).
*   `created_at` (TIMESTAMPTZ)
*   `updated_at` (TIMESTAMPTZ)

**`devices` (Sensor/IoT Registration)**
*   `id` (UUID, PK)
*   `tenant_id` (UUID, FK, Nullable)
*   `mac_address` (VARCHAR, UNIQUE)
*   `device_type` (ENUM: `INCUBATOR_SENSOR`, `GENERATOR_MONITOR`, `BROODER_MONITOR`)
*   `assigned_to_entity_id` (UUID) - Polymorphic link to `incubators.id` or `generators.id`.
*   `status` (ENUM: `ONLINE`, `OFFLINE`, `MAINTENANCE`)
*   `last_ping_at` (TIMESTAMPTZ)

**`incubators` & `brooders` (Equipment)**
*   `id` (UUID, PK)
*   `tenant_id` (UUID, FK, Nullable)
*   `name` (VARCHAR)
*   `capacity` (INTEGER)
*   `status` (ENUM: `ACTIVE`, `CLEANING`, `REPAIR`)
*   `created_at` (TIMESTAMPTZ)

**`egg_batches` (Traceability & Workflow)**
*   `id` (UUID, PK)
*   `tenant_id` (UUID, FK, Nullable)
*   `batch_number` (VARCHAR, UNIQUE) - Human-readable sequence.
*   `supplier_id` (UUID, FK) - Where the eggs came from.
*   `incubator_id` (UUID, FK)
*   `quantity_received` (INTEGER)
*   `status` (ENUM: `LOGGED`, `SETTER`, `HATCHER`, `COMPLETED`, `DISCARDED`)
*   `set_date` (TIMESTAMPTZ)
*   `expected_hatch_date` (TIMESTAMPTZ)
*   `actual_hatch_date` (TIMESTAMPTZ, Nullable)
*   `quantity_hatched` (INTEGER)
*   `quantity_culled` (INTEGER) - Unviable chicks.
*   `sync_version` (INT, DEFAULT 1) - Offline sync version control.
*   `created_at` / `updated_at` (TIMESTAMPTZ)

**`mortality_logs` (Worker Accountability)**
*   `id` (UUID, PK)
*   `tenant_id` (UUID, FK, Nullable)
*   `batch_id` (UUID, FK) - Link to specific batch.
*   `recorded_by_id` (UUID, FK to `profiles`)
*   `quantity` (INTEGER)
*   `reason` (VARCHAR)
*   `photo_url` (VARCHAR, Nullable) - Link to Supabase Storage bucket for visual proof.
*   `created_at` (TIMESTAMPTZ)

**`sales_orders` (Financial Transactions)**
*   `id` (UUID, PK)
*   `tenant_id` (UUID, FK, Nullable)
*   `customer_id` (UUID, FK)
*   `batch_id` (UUID, FK) - Enables full egg-to-sale traceability.
*   `quantity` (INTEGER)
*   `price_per_chick` (DECIMAL)
*   `total_amount` (DECIMAL)
*   `payment_status` (ENUM: `PENDING`, `PARTIAL`, `PAID`)
*   `payment_method` (ENUM: `M_PESA`, `CASH`, `BANK_TRANSFER`)
*   `created_at` / `updated_at` / `deleted_at` (Soft delete)

**`generators` & `power_logs` (Infrastructure Operations)**
*   `id` (UUID, PK)
*   `name` (VARCHAR)
*   `fuel_level_percent` (INTEGER)
*   `status` (ENUM: `STANDBY`, `RUNNING`, `FAULT`)

#### Schema: `telemetry` (TimescaleDB / Time-Series Data)

*We utilize TimescaleDB extension for hyper-tables to handle massive IoT ingest without slowing down transactional queries.*

**`sensor_readings`**
*   `time` (TIMESTAMPTZ, PK alongside device_id)
*   `device_id` (UUID, FK to `public.devices`)
*   `temperature` (DECIMAL)
*   `humidity` (DECIMAL)
*   `co2_level` (DECIMAL)
*   `power_status` (BOOLEAN) - Mains vs Generator.

#### Schema: `system` (Alerts & Notifications)

**`alerts`**
*   `id` (UUID, PK)
*   `device_id` (UUID, FK)
*   `alert_type` (ENUM: `TEMP_SPIKE`, `POWER_OUTAGE`, `HUMIDITY_DROP`)
*   `severity` (ENUM: `WARNING`, `CRITICAL`)
*   `status` (ENUM: `UNACKNOWLEDGED`, `ACKNOWLEDGED`, `RESOLVED`)
*   `resolved_by_id` (UUID, FK to `profiles`)
*   `created_at` / `resolved_at` (TIMESTAMPTZ)

---

### 3. File/Photo Attachment Strategy
We utilize Supabase Storage.
*   **Bucket `mortality_evidence`**: Workers upload photos of dead chicks/eggs to justify loss numbers. The DB `mortality_logs.photo_url` stores the relative path.
*   **Bucket `receipts`**: Customer M-Pesa or bank transfer receipts linked to `sales_orders`.

### 4. Row Level Security (RLS) Strategy
RLS is enforced at the database layer to ensure strict tenant and role isolation:
1.  **Isolate by Tenant**: Every query automatically scopes to the user's `tenant_id`. (`auth.jwt() ->> 'tenant_id'`).
2.  **Role Context**:
    *   `WORKER`: Can `SELECT` active `incubators` and `egg_batches`. Can `INSERT` `mortality_logs`. Cannot `DELETE` anything.
    *   `MANAGER`: Can `UPDATE` `egg_batches` statuses, `INSERT` `sales_orders`.
    *   `SUPER_ADMIN`: Bypass RLS policies on configurational tables (Devices, Incubators).

### 5. Recommended Indexes
To assure high performance as data grows:
*   `CREATE INDEX idx_egg_batches_status ON egg_batches(status);` - Speeds up dashboard queries.
*   `CREATE INDEX idx_sensor_readings_time_desc ON telemetry.sensor_readings(time DESC);` - Fast retrieval of latest ping.
*   `CREATE INDEX idx_sales_orders_customer_id ON sales_orders(customer_id);`
*   `CREATE INDEX idx_mortality_logs_batch_id ON mortality_logs(batch_id);`

### 6. Potential Schema Risks & Mitigations
*   **Risk**: `sensor_readings` table bloat over months leading to sluggish dashboards.
    *   **Mitigation**: Implement TimescaleDB continuous aggregates to automatically compute and store hourly/daily averages, purging raw second-by-second data after 14 days.
*   **Risk**: Offline Sync Collisions (Two workers updating the same batch simultaneously).
    *   **Mitigation**: App architecture must utilize RPCs (Remote Procedure Calls) via Supabase for critical state transitions rather than direct `UPDATE` queries, allowing the DB function to handle `sync_version` checks and throw conflict errors if the versions mismatch.
*   **Risk**: Orphaned files in Supabase Storage if the corresponding DB row is deleted.
    *   **Mitigation**: The soft-delete `deleted_at` strategy prevents DB row removal, ensuring URLs remain valid for audit trails.
