# Abby Tech Smart Hatchery Platform
## Backend Domain Architecture & Workflow Engine

This document outlines the backend architecture, operational workflows, and domain boundaries for the Abby Tech Smart Hatchery Platform. Designed for a Next.js and Supabase ecosystem, this architecture prioritizes operational reliability, strict state management, and high maintainability for a lean engineering team.

### 1. Domain-Driven Module Boundaries

To avoid premature microservices but maintain clean separation of concerns, the backend is organized into "Modular Monolith" logic domains within the Next.js `app/api` and `server/` directories:

*   **Incubation Domain (`/server/domains/incubation`)**: Manages `egg_batches`, `incubators`, and `mortality_logs`. Owns the core chick production lifecycle.
*   **Telemetry Domain (`/server/domains/telemetry`)**: High-throughput ingestion of `sensor_readings`, anomaly detection, and generator monitoring.
*   **Commercial Domain (`/server/domains/commercial`)**: Customer management, `sales_orders`, pricing, and payment states (M-Pesa integrations).
*   **Notification & Alerting Domain (`/server/domains/alerts`)**: Event routing, SMS/WhatsApp (Twilio), and escalation ladders.
*   **Identity & Audit Domain (`/server/domains/identity`)**: RBAC enforcement, `profiles`, and `audit_logs`.

*Architectural Tradeoff*: We use module boundaries within a single Next.js Node/Edge environment rather than separate deployed microservices. This drastically reduces DevOps overhead, prevents network latency between domains, and provides rich context for AI assistants like Copilot to generate cross-domain logic.

---

### 2. Hatchery Workflow State Machines

State transitions are strictly enforced via Supabase RPCs (Remote Procedure Calls) and Zod validation, never via direct client `UPDATE` queries. 

#### A. Incubation Lifecycle
```text
[LOGGED] (Eggs received in storage)
   |--> [SETTER] (Moved to 18-day incubation, start countdown)
          |--> [HATCHER] (Moved to 3-day hatching baskets)
                 |--> [COMPLETED] (Chicks extracted, yield calculated)
                 |--> [DISCARDED] (Zero yield or contaminated)
```
*   **Business Rule Enforcements**: 
    *   Cannot transition to `HATCHER` unless currently in `SETTER`.
    *   Transitioning to `COMPLETED` requires a payload of `quantity_hatched` and `quantity_culled`.
    *   The sum of `quantity_hatched` + `quantity_culled` + historical `mortalities` cannot exceed original `quantity_received`.

#### B. Sales Order Lifecycle
```text
[PENDING] (Order created, awaiting payment)
   |--> [PARTIAL] (Deposit received via M-Pesa)
   |--> [PAID] (Fully paid, ready for fulfillment)
          |--> [FULFILLED] (Chicks handed over to customer)
   |--> [CANCELLED] (Refunded or voided)
```

---

### 3. Mortality Workflow Logic & Accountability

Handling mortalities is sensitive because it directly impacts inventory variance and financial loss.
*   **Event Flow**:
    1.  Worker logs a mortality event offline on the mobile PWA (e.g., 5 eggs broken).
    2.  App forces a mandatory photo capture and selection of a predefined `reason` code.
    3.  When online, the payload syncs to the backend via the `LogMortality` RPC.
    4.  The RPC updates the `egg_batches.quantity_received` (virtual deduction) and logs to `mortality_logs` inside a single atomic transaction.
    5.  If mortality exceeds x% of the batch, the Alerting Domain fires an asynchronous "High Mortality Anomaly" SMS to the Manager.

---

### 4. Real-time Telemetry & Alert Escalation Engine

```text
[ESP32 / MQTT Broker] ---> (HTTP Webhook) ---> [Next.js /api/iot/ingest]
```
*   **Processing Flow**:
    1.  **Ingest & Validate**: Next.js receives the payload, validates the device MAC address, and drops malformed packets using Zod.
    2.  **Write**: Data is written to the TimescaleDB `sensor_readings` table.
    3.  **Evaluate (Async)**: A lightweight rule-engine evaluates the payload against strict thresholds (e.g., Temp > 38.0°C).
    4.  **Escalate**:
        *   *Trigger*: Anomaly detected.
        *   *Level 1*: Insert into `alerts` table as `UNACKNOWLEDGED` (Warning). Pushes WebSocket notification to web dashboard.
        *   *Level 2*: If Temp is critical (> 38.5°C) OR Power is lost, immediately queue an SMS to the on-duty Technician.
        *   *Level 3*: If alert remains `UNACKNOWLEDGED` for 15 minutes, trigger Supabase Edge Function to SMS the Hatchery Manager.

---

### 5. Offline Synchronization Engine (Conflict Resolution)

Because internet is intermittent in African agricultural setups, offline support is paramount.
*   **Mechanism**: "Version-Vector with Server Authority"
    1.  When fetching an `egg_batch`, the client receives `sync_version = 1`.
    2.  Worker modifies the batch offline and stores it in IndexedDB with `mutation_intent = UPDATE_STATUS`.
    3.  Upon network restore, the client pushes the mutation payload along with the `expected_version = 1`.
    4.  Supabase RPC `sync_batch_update` checks if `current_db_version == expected_version`.
    5.  *Success*: Apply changes, increment `sync_version` to 2.
    6.  *Conflict*: If `current_db_version > expected_version` (another worker changed it), the server rejects the sync. The client pulls the fresh state and alerts the user to merge/re-enter.

---

### 6. Background Job Architecture

We leverage `pg_cron` inside PostgreSQL to handle recurring operations without maintaining external worker nodes (like Redis/Celery).
*   **`cron.daily_yield_rollup`**: Aggregates the previous day's hatch rates, calculates average sensor variance, and populates a fast-read analytics view.
*   **`cron.stale_alert_escalator`**: Runs every 5 minutes. Finds unacknowledged critical alerts and fires webhooks to the Next.js Alerting API for SMS dispatch.
*   **`cron.iot_data_retention`**: Runs weekly. Downsamples 1-minute interval TimescaleDB telemetry into 1-hour intervals for rows older than 30 days to save disk space.

---

### 7. API Endpoint Organization

We enforce a strict separation between API consumers:
1.  **Server Actions (`/app/actions/...`)**: 
    *   Used strictly by the Next.js React Admin UI. 
    *   Benefits from built-in CSRF protection, seamless TypeScript typing, and automatic Next.js cache invalidation (`revalidatePath`).
2.  **REST API Routes (`/app/api/v1/...`)**:
    *   Used by external systems (MQTT Brokers, M-Pesa Webhooks, future React Native App).
    *   Example: `/api/v1/iot/ingest`, `/api/v1/payments/mpesa-callback`.
    *   Secured via static API keys or JWT Bearer tokens.

---

### 8. Validation and Error Handling Pipeline

Optimizing for Copilot/Codex means establishing hyper-predictable patterns. Every input goes through standard envelopes:

```typescript
// Conceptual Flow - NOT implementation code
1. Input arrives.
2. Parsed by Shared Zod Schema (`schemas/incubation.ts`).
   -> Invalid: Throws standard `ValidationError` -> Returns HTTP 400.
3. Check RBAC permissions.
   -> Unauthorized: Throws `ForbiddenError` -> Returns HTTP 403.
4. Execute DB Transaction (via Supabase RPC / Client).
   -> DB Constraint Fails: Throws `ConflictError` -> Returns HTTP 409.
5. Return JSON Envelope `{ success: true, data: {...} }`.
```

### 9. Business Rule Enforcement Strategy

To prevent data corruption bugs:
1.  **Database Level (Absolute Truth)**: Enums, Foreign Keys, CHECK constraints (e.g., `CHECK (quantity_hatched >= 0)`), and Row-Level Security.
2.  **Database RPCs**: Complex cross-table integrity (like the Mortality/Inventory reduction logic) is housed here so that no API route can accidentally bypass it.
3.  **Application Level (UX & Routing)**: Next.js Server Actions enforce semantic rules (e.g., "Cannot issue refund if payment status is PENDING") and handle the third-party integrations (Twilio, M-Pesa).

### 10. Architectural Tradeoffs & Risks Summary
*   **RPCs vs Application Logic**: Moving logic into PostgreSQL RPCs creates vendor lock-in with Supabase/PostgreSQL. *Tradeoff Accepted*: Operational atomicity and offline-sync safety are far more valuable for this startup than database agnosticism.
*   *Risk*: Next.js Serverless timeouts (function execution time limit) during massive offline sync bursts. *Mitigation*: The offline sync logic pushes mutations in small chunks/batches (e.g., 50 records at a time) rather than one massive payload.
