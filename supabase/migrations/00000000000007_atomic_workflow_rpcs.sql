-- Atomic mortality logging.

CREATE OR REPLACE FUNCTION log_mortality_event_atomic(
    p_batch_id uuid,
    p_stage mortality_stage,
    p_cause mortality_cause,
    p_count integer,
    p_notes text DEFAULT NULL,
    p_photo_url text DEFAULT NULL,
    p_recorded_by uuid DEFAULT NULL
)
RETURNS TABLE (
    event_id uuid,
    estimated_financial_loss numeric,
    mortality_count integer,
    total_financial_loss numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch egg_batches%ROWTYPE;
    v_operational_costs numeric(12,2);
    v_estimated_loss numeric(12,2);
    v_event_id uuid;
BEGIN
    IF p_count IS NULL OR p_count <= 0 THEN
        RAISE EXCEPTION 'Mortality count must be greater than zero';
    END IF;

    SELECT *
    INTO v_batch
    FROM egg_batches
    WHERE egg_batches.id = p_batch_id
      AND egg_batches.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;

    SELECT COALESCE(SUM(cost_entries.amount), 0)
    INTO v_operational_costs
    FROM cost_entries
    WHERE cost_entries.batch_id = p_batch_id
      AND cost_entries.deleted_at IS NULL;

    v_estimated_loss := ROUND(
        ((COALESCE(v_batch.total_initial_cost, 0) + COALESCE(v_operational_costs, 0))
          / GREATEST(v_batch.quantity_received, 1)) * p_count,
        2
    );

    INSERT INTO mortality_events (
        batch_id,
        stage,
        cause,
        count,
        notes,
        photo_url,
        estimated_financial_loss,
        recorded_by,
        recorded_at,
        created_at,
        sync_version
    )
    VALUES (
        p_batch_id,
        p_stage,
        p_cause,
        p_count,
        p_notes,
        p_photo_url,
        v_estimated_loss,
        p_recorded_by,
        now(),
        now(),
        1
    )
    RETURNING id INTO v_event_id;

    UPDATE egg_batches
    SET mortality_count = COALESCE(egg_batches.mortality_count, 0) + p_count,
        total_financial_loss = COALESCE(egg_batches.total_financial_loss, 0) + v_estimated_loss,
        updated_at = now(),
        sync_version = egg_batches.sync_version + 1
    WHERE egg_batches.id = p_batch_id
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
        p_batch_id,
        'MORTALITY_RECORDED',
        COALESCE(p_notes, p_count::text || ' mortality recorded at ' || p_stage::text || ' stage.'),
        p_recorded_by,
        now(),
        now(),
        1
    );

    event_id := v_event_id;
    estimated_financial_loss := v_estimated_loss;
    RETURN NEXT;
END;
$$;
