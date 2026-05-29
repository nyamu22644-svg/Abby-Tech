# Abby Tech Smart Hatchery Platform
## Engineering Specification & Architecture Document

### 1. Project Structure & Monorepo Architecture
We will use a **Turborepo** monorepo structure. This allows us to share business logic, database types, and UI components between the Next.js web application, the future React Native app, and our serverless/edge functions.

**Folder Structure:**
```text
abbyetech-monorepo/
├── apps/
│   ├── web/                 # Next.js App Router (Admin, Dashboard, PWA)
│   ├── mobile/              # React Native / Expo (Future Mobile App)
│   └── api/                 # Edge functions / microservices (MQTT Webhooks)
├── packages/
│   ├── ui/                  # Shared TailwindCSS & Shadcn UI library
│   ├── db/                  # Supabase clients, TypeScript schema generation
│   ├── iot/                 # Shared IoT payload parsers and constants
│   ├── offline/             # IndexedDB sync engine and offline queue logic
│   └── config/              # Shared ESLint, TypeScript, and Tailwind configs
```

### 2. Service Boundaries & API Architecture
We will adopt a **Serverless-First** API architecture to keep operational costs low and scaling infinite.

*   **Core UI & Business Logic:** Handled by Next.js React Server Components (RSC) and Server Actions.
*   **IoT Ingestion Service:** A dedicated API route or Supabase Edge Function to receive telemetry from the MQTT broker, validate it, and write it to the database.
*   **Real-time Engine:** Supabase Realtime (WebSockets) will push database changes directly to the Next.js client, updating operational dashboards instantly.
*   **Background Jobs:** Supabase CRON for daily aggregations (e.g., calculating average hatchability, sending daily summary emails).

### 3. Architecture Diagrams

**High-Level System Architecture:**
```text
  [ ESP32 Sensors ] 
       | (MQTT)
       v
  [ Cloud MQTT Broker ] (e.g., HiveMQ / EMQX)
       | (Webhook / HTTP Post)
       v
  [ IoT Ingestion API ] (Next.js API Route / Edge Function)
       | (Write Telemetry)
       v
  [ Supabase (PostgreSQL) ] <---(Database Webhooks)---> [ Alerting Engine (Twilio/Resend) ]
       | (WebSocket Realtime)
       v
  [ Next.js Web App (PWA) ] <---> [ Local IndexedDB ] (Offline-First Storage)
```

### 4. Supabase & PostgreSQL Architecture
We will utilize PostgreSQL schemas to separate concerns:

**Schema Planning:**
*   `public`: Core business entities.
    *   `incubators`: ID, status, location, capacity.
    *   `batches`: Egg batches, origin, expected_hatch_date, incubator_id, status.
    *   `events`: Incubation failures, notes, mortality logs.
*   `telemetry`: Time-series data (Integrated with **TimescaleDB** extension).
    *   `sensor_readings`: timestamp, incubator_id, temperature, humidity, power_status.
*   `auth`: Supabase managed schema for users and sessions.

### 5. Real-Time Telemetry Ingestion
1.  **ESP32 Firmware** publishes JSON payloads to an MQTT broker under topics like `hatchery/Nairobi/incubator/4/status`.
2.  **Broker Webhook** forwards the payload to our Next.js API `POST /api/iot/ingest`.
3.  **Validation**: Zod schema validates the payload.
4.  **Storage**: Written to the `telemetry.sensor_readings` table.
5.  **Broadcast**: Supabase Realtime broadcasts the `INSERT` to active Dashboard clients to map live temp/humidity graphs.

### 6. Offline Synchronization Architecture
In Kenya, power outages often mean internet router outages. The web app must function offline.
*   **Strategy**: Next.js configured as a Progressive Web App (PWA) with Service Workers.
*   **Data Store**: `Dexie.js` (IndexedDB wrap) for local read/writes.
*   **Sync Logic**: 
    1. Worker logs an event (e.g., "Batch 45 moved to Brooder").
    2. Saved to IndexedDB `sync_queue`.
    3. Network status listener detects reconnection.
    4. Queued mutations are pushed to Supabase via Server Actions in a background thread.
    5. Conflicts are resolved via "Last Write Wins" or timestamp merging.

### 7. Authentication & Role-Based Access Control (RBAC)
Leveraging Supabase Auth with custom claims and Row Level Security (RLS).
*   **Roles**: `SuperAdmin`, `Manager`, `Technician`, `FarmWorker`.
*   **RLS Policies**: 
    *   `FarmWorker` can `INSERT` mortalities and `SELECT` assigned batches.
    *   `Manager` can `UPDATE` batch statuses.
    *   `SuperAdmin` can provision new `incubators`.

### 8. Event-Driven Alert Architecture
Using Supabase Database Webhooks.
*   **Trigger**: Trigger on `INSERT` to `telemetry.sensor_readings`.
*   **Condition**: If `temperature > 38.0` OR `power_status == false`.
*   **Action**: Call Notification Microservice.
*   **Delivery**: Uses Twilio for critical SMS/WhatsApp alerts (since local workers might not check email) and Resend for management summary emails.

### 9. Naming Conventions & Code Standards
*   **Database**: `snake_case` for tables and columns (e.g., `sensor_readings`, `hatch_date`).
*   **TypeScript**: `PascalCase` for Types/Interfaces, `camelCase` for variables and functions.
*   **API Routes**: Versioned REST/RPC `/api/v1/iot/ingest`.
*   **Branching**: `feature/batch-tracking`, `fix/humidity-alert`, `chore/deps`.

### 10. Environment Management
*   `development`: Local dev with local Supabase stack.
*   `staging`: Remote Supabase instance matching prod schema. Used for QA testing with simulated MQTT data.
*   `production`: Mission-critical environment. Vercel for Next.js, Supabase Pro tier with daily backups.

### 11. Scalability Considerations & Technical Risks
*   **Risk**: TimescaleDB storage limits from high-frequency IoT data.
    *   *Mitigation*: Implement data retention policies and rollups (e.g., keep 1-minute resolution for 7 days, 1-hour resolution for 1 year).
*   **Risk**: Offline Sync Conflicts if two workers modify the same batch while offline.
    *   *Mitigation*: Use granular event-sourcing for state changes rather than full row overrides.
*   **Risk**: Connection drops during MQTT streaming.
    *   *Mitigation*: Implement QoS 1 on ESP32 to ensure at-least-once delivery, and deduplicate payloads in the API using message IDs.

### 12. Recommended Development Order
1.  **Phase 1: Foundation (Weeks 1-2)**
    *   Initialize monorepo, Next.js, and Supabase schema.
    *   Set up Auth and define RLS policies.
2.  **Phase 2: Core Operations (Weeks 3-4)**
    *   Build CRUD screens for Incubators, Egg Batches, and Mortalities.
    *   Implement offline-mode capability with Dexie.js for these specific forms.
3.  **Phase 3: IoT Pipeline (Weeks 5-6)**
    *   Set up TimescaleDB tables.
    *   Build the Next.js Ingestion API and connect a mock MQTT publisher.
    *   Wire up real-time Dashboard graphs.
4.  **Phase 4: Alerting & Polish (Weeks 7-8)**
    *   Configure database triggers for temperature/humidity anomalies.
    *   Integrate SMS/WhatsApp alerting.
    *   Deploy staging, conduct field tests without internet.
