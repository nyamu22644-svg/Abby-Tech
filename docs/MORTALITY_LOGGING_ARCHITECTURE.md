# Abby Tech Smart Hatchery Platform
## Mortality Logging Operational Architecture

This document defines the architecture, workflows, and implementation standards for the Mortality Logging module of the Abby Tech platform. This module is mission-critical: it records biological losses, impacts financial inventory, and requires strict anti-fraud/accountability enforcement.

---

### 1. Field-Worker Mobile UX & Error Prevention

The hatchery floor is a fast-paced, often messy environment. The UI must accommodate workers wearing gloves or operating with minimal screen glare visibility.

*   **Progressive Capture Wizard**: Avoid long scrolling forms. Use a step-by-step flow: `Select Batch` -> `Enter Quantity` -> `Select Reason` -> `Capture Evidence`.
*   **Tap Targets**: All interactive elements (buttons, list items) must be a minimum of `48px` tall (Tailwind `min-h-[48px]` or `min-h-12`).
*   **Input Enforcement**: 
    *   Quantity inputs strictly use `<input type="text" inputMode="numeric" pattern="[0-9]*" />` to force the numeric keypad on iOS/Android.
    *   Prevent double-submissions by disabling buttons and showing a clear "Processing..." overlay on submission.
*   **Contextual Validation**: The UI securely fetches the `remaining_live_quantity` for the batch. If a worker enters a mortality quantity greater than the live quantity, the UI blocks progression immediately.

### 2. Cause Classification Architecture

To calculate accurate hatchery trends and identify incubator faults, mortality reasons cannot be free-text. They must use strictly defined enums mapped to the incubation state of the batch constraints.

**Standardized Enums (`mortality_reason`):**
*   `INFERTILE` (Usually logged at candling day 7 or 18)
*   `EARLY_DEAD` (Embryonic death days 1-7)
*   `LATE_DEAD` (Embryonic death days 18-21)
*   `PIPPED_NOT_HATCHED` (Failed to break shell completely)
*   `CULL_DEFORMED` (Hatched but unviable)
*   `CONTAMINATED` (Bacterial/fungal explosion)
*   `ACCIDENTAL_BREAKAGE` (Human/equipment handling error)

*Logic Constraint*: The UI filters available reasons based on the batch's current stage. (e.g., A worker cannot select `PIPPED_NOT_HATCHED` if the batch is still in the `SETTER` stage).

### 3. Required Evidence & Photo Workflows (Anti-Fraud)

To prevent fraudulent inventory shrinkage (e.g., workers stealing eggs/chicks and marking them as mortalities), strict evidence rules are enforced.

*   **Dynamic Evidence Thresholds**: Any mortality entry where `quantity > 3` (configurable via tenant settings) strictly requires photographic evidence.
*   **Capture Strategy**: The UI utilizes the HTML5 `<input type="file" accept="image/*" capture="environment" />` attribute. On mobile devices, this directly opens the camera directly and discourages selecting old photos from the camera roll.
*   **Upload Pipeline**:
    1. Photo heavily compressed client-side (e.g., via `browser-image-compression`) to save bandwidth.
    2. Uploaded directly to Supabase Storage bucket `mortality_evidence`.
    3. The resulting path is bound to the `mortality_logs` database row.

### 4. Offline-First Mortality Capture

Hatchery incubation rooms often act as Faraday cages resulting in zero internet connectivity.

*   **Storage Strategy**: Using `Dexie.js` (IndexedDB).
*   **Photo Caching**: If offline, the captured photo is stored as a `Blob` internally in IndexedDB.
*   **Sync Queue**: The log is pushed to a background `sync_queue` table locally. The UI routes the user back to the batch list with a green "Saved Offline" toast.
*   **Resolution Pipeline**: When `navigator.onLine` fires, a background provider uploads the Blobs to Supabase Storage *first*, retrieves the URLs, attaches them to the JSON payloads, and calls the Supabase RPC to commit the database rows.

### 5. Audit & Accountability Enforcement

*   **Immutable Logs**: Once a mortality record reaches Supabase, it is cryptographically locked by an RLS policy: `CREATE POLICY "Mortality Immutable" ON mortality_logs FOR UPDATE USING (false);`
*   **Correction Workflows**: Workers cannot edit or delete a mortality log. If a mistake is made, they must submit a "Correction Request". A Manager reviews it, and if approved, an offsetting adjustment record is appended to the ledger. This ensures the audit trail is never destroyed.
*   **Attribution**: The `recorded_by_id` is automatically pulled securely from the `auth.jwt()` session on the server. The client cannot spoof who recorded the loss.

### 6. Batch Linkage Integrity

The mortality logging module must maintain mathematical integrity with the source batch.

*   **Transactional Ledger**: Mortalities are not just floating records; they represent inventory deductions.
*   **RPC Engine**: The client UI does not execute `UPDATE egg_batches SET quantity = quantity - X`. Instead, it calls `await supabase.rpc('log_batch_mortality', payload)`.
*   **Postgres Enforcement**: The RPC acquires a row-level lock on the `egg_batches` row, verifies that `quantity_received - total_mortalities - new_mortality >= 0`, inserts the log, and updates the materialized view.

### 7. Escalation Threshold Logic & Trend Calculations

*   **Real-time Threshold Monitoring**: Upon a successful DB insertion trigger, PostgreSQL checks if the `total_batch_mortality` percentage crosses predefined thresholds (e.g., 2% for Early Dead, 5% overall).
*   **Alert Generation**: If the threshold is breached, a critical alert is injected into the `alerts` table, triggering an immediate notification to the Hatchery Manager (via the SMS/Alert domain) to investigate potential incubator failure or disease outbreaks.

### 8. Role-Aware UI UX

*   **`WORKER` View**: Optimized solely for speed of entry. Large keys, simple drop-downs, camera prompts, and a history limited to their own entries for the current shift.
*   **`MANAGER` View**: Mortality Timeline / History Views.
    *   **The Ledger Grid**: A dense, sorting-capable Shadcn data-table showing batch numbers, personnel attributions, causality distributions, and timestamp ledgers.
    *   **Evidence Review**: Thumbnail hover-states allowing the manager to quickly inspect uploaded photos without opening distinct modal windows. 
    *   **Trend Sparklines**: Micro-charts (using `recharts`) showing 7-day trailing mortality averages per incubator zone to identify micro-climate issues in specific machines.

### 9. Validation and Error Recovery

*   **Client Validation**: Zod schema prevents submission of negative numbers, missing reasons, or skipped photos.
*   **Zod Schema Sharing**:
    ```typescript
    export const MortalityLogSchema = z.object({
      batch_id: z.string().uuid(),
      quantity: z.number().int().positive().max(5000), // Max sanity-check
      reason: z.enum(['INFERTILE', 'EARLY_DEAD', 'CONTAMINATED', /* ... */]),
      photo_blob: z.any().optional(), // Processed in multipart/form-data
    });
    ```
*   **Recovery**: If the sync queue fails permanently (e.g., HTTP 500 error from the server), the UI must not delete the offline cache. It halts the queue sync and prominently displays a red sync-error banner urging the worker to contact IT, preventing data loss.
