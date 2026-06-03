-- Atomic candling update.

CREATE OR REPLACE FUNCTION record_candling_atomic(
    p_batch_id uuid,
    p_culled_count integer,
    p_notes text DEFAULT NULL,
    p_recorded_by uuid DEFAULT NULL
)
RETURNS TABLE (
    batch_id uuid,
    quantity_culled integer,
    viable_eggs integer
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch egg_batches%ROWTYPE;
    v_loaded_eggs integer;
BEGIN
    IF p_culled_count IS NULL OR p_culled_count < 0 THEN
        RAISE EXCEPTION 'Candling removal count cannot be negative';
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

    IF v_batch.set_date IS NULL THEN
        RAISE EXCEPTION 'Place the batch in an incubator before recording candling';
    END IF;

    IF now() < v_batch.set_date + interval '7 days' THEN
        RAISE EXCEPTION 'Candling is not due yet';
    END IF;

    IF v_batch.status IN ('COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Candling cannot be recorded for a closed batch';
    END IF;

    v_loaded_eggs := COALESCE(v_batch.quantity_set, v_batch.accepted_eggs, v_batch.quantity_received, 0);

    IF p_culled_count > v_loaded_eggs THEN
        RAISE EXCEPTION 'Removed eggs cannot exceed loaded eggs';
    END IF;

    UPDATE egg_batches
    SET quantity_culled = p_culled_count,
        updated_at = now(),
        sync_version = egg_batches.sync_version + 1
    WHERE egg_batches.id = p_batch_id;

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
        'CANDLING_RECORDED',
        COALESCE(p_notes, 'Candling recorded. Removed ' || p_culled_count::text || ' eggs.'),
        p_recorded_by,
        now(),
        now(),
        1
    );

    batch_id := p_batch_id;
    quantity_culled := p_culled_count;
    viable_eggs := v_loaded_eggs - p_culled_count;
    RETURN NEXT;
END;
$$;
