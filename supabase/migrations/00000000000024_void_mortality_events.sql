-- Auditable mortality correction workflow.
-- Mortality records are not hard deleted. Voiding reverses the stored batch
-- totals and keeps the original event for operational traceability.

ALTER TABLE mortality_events
ADD COLUMN IF NOT EXISTS voided_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS void_reason text,
ADD COLUMN IF NOT EXISTS void_operational_log_id uuid REFERENCES operational_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mortality_events_active_batch
ON mortality_events(batch_id, recorded_at DESC)
WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mortality_events_voided
ON mortality_events(voided_at)
WHERE voided_at IS NOT NULL;

CREATE OR REPLACE FUNCTION void_mortality_event_atomic(
    p_event_id uuid,
    p_reason text,
    p_voided_by uuid DEFAULT NULL
)
RETURNS TABLE (
    event_id uuid,
    batch_id uuid,
    reversed_count integer,
    reversed_financial_loss numeric,
    mortality_count integer,
    total_financial_loss numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_event mortality_events%ROWTYPE;
    v_batch egg_batches%ROWTYPE;
    v_reason text;
    v_log_id uuid;
BEGIN
    v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');

    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'Correction reason is required';
    END IF;

    SELECT *
    INTO v_event
    FROM mortality_events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mortality event not found';
    END IF;

    IF v_event.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'Mortality event has already been voided';
    END IF;

    SELECT *
    INTO v_batch
    FROM egg_batches
    WHERE id = v_event.batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found for mortality event';
    END IF;

    IF COALESCE(v_batch.mortality_count, 0) < v_event.count THEN
        RAISE EXCEPTION 'Cannot void mortality event because batch mortality total is already lower than the event count';
    END IF;

    IF COALESCE(v_batch.total_financial_loss, 0) < COALESCE(v_event.estimated_financial_loss, 0) THEN
        RAISE EXCEPTION 'Cannot void mortality event because batch financial loss total is already lower than the event loss';
    END IF;

    UPDATE egg_batches
    SET mortality_count = egg_batches.mortality_count - v_event.count,
        total_financial_loss = egg_batches.total_financial_loss - COALESCE(v_event.estimated_financial_loss, 0),
        updated_at = now(),
        sync_version = egg_batches.sync_version + 1
    WHERE egg_batches.id = v_event.batch_id
    RETURNING egg_batches.mortality_count, egg_batches.total_financial_loss
    INTO mortality_count, total_financial_loss;

    INSERT INTO operational_logs (
        tenant_id,
        entity_type,
        entity_id,
        log_type,
        notes,
        recorded_by,
        recorded_at,
        created_at,
        sync_version
    )
    VALUES (
        v_batch.tenant_id,
        'egg_batch',
        v_event.batch_id,
        'MORTALITY_VOIDED',
        'Voided mortality event ' || v_event.id::text || '. Reversed ' || v_event.count::text || ' birds. Reason: ' || v_reason,
        p_voided_by,
        now(),
        now(),
        1
    )
    RETURNING id INTO v_log_id;

    UPDATE mortality_events
    SET voided_at = now(),
        voided_by = p_voided_by,
        void_reason = v_reason,
        void_operational_log_id = v_log_id,
        sync_version = mortality_events.sync_version + 1
    WHERE mortality_events.id = p_event_id;

    event_id := p_event_id;
    batch_id := v_event.batch_id;
    reversed_count := v_event.count;
    reversed_financial_loss := COALESCE(v_event.estimated_financial_loss, 0);
    RETURN NEXT;
END;
$$;
