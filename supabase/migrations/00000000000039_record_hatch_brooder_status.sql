-- Fix hatch recording status assignment so successful hatches move to BROODER and zero-hatch results move to FAILED.

CREATE OR REPLACE FUNCTION record_hatch_atomic(
    p_batch_id uuid,
    p_hatched_count integer,
    p_final_culled_count integer DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_actual_hatch_date timestamptz DEFAULT NULL,
    p_recorded_by uuid DEFAULT NULL
)
RETURNS TABLE (
    hatch_result_id uuid,
    total_set integer,
    total_hatched integer,
    total_culled integer,
    hatch_rate numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch egg_batches%ROWTYPE;
    v_loaded_eggs integer;
    v_prior_culled integer;
    v_total_culled integer;
    v_hatch_rate numeric(5,2);
    v_hatch_result_id uuid;
    v_status batch_status;
    v_log_type varchar;
    v_log_notes text;
BEGIN
    IF p_hatched_count IS NULL OR p_hatched_count < 0 THEN
        RAISE EXCEPTION 'Hatched count cannot be negative';
    END IF;

    IF p_final_culled_count IS NULL OR p_final_culled_count < 0 THEN
        RAISE EXCEPTION 'Final culled count cannot be negative';
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

    IF v_batch.status IN ('COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED') THEN
        RAISE EXCEPTION 'This batch is already closed';
    END IF;

    v_loaded_eggs := COALESCE(v_batch.quantity_set, v_batch.accepted_eggs, v_batch.quantity_received, 0);
    v_prior_culled := COALESCE(v_batch.quantity_culled, 0);
    v_total_culled := v_prior_culled + p_final_culled_count;

    IF p_hatched_count + v_total_culled > v_loaded_eggs THEN
        RAISE EXCEPTION 'Hatched plus culled cannot exceed loaded eggs';
    END IF;

    v_hatch_rate := CASE
        WHEN v_loaded_eggs > 0 THEN ROUND((p_hatched_count::numeric / v_loaded_eggs::numeric) * 100, 2)
        ELSE 0
    END;

    IF p_hatched_count > 0 THEN
        v_status := 'BROODER';
        v_log_type := 'HATCH_COMPLETED';
        v_log_notes := COALESCE(p_notes, 'Hatch completed. ' || p_hatched_count::text || ' chicks hatched.');
    ELSE
        v_status := 'FAILED';
        v_log_type := 'HATCH_FAILED';
        v_log_notes := COALESCE(p_notes, 'Hatch failed. No chicks hatched.');
    END IF;

    UPDATE egg_batches
    SET status = v_status,
        quantity_hatched = p_hatched_count,
        quantity_culled = v_total_culled,
        actual_hatch_date = COALESCE(p_actual_hatch_date, now()),
        updated_at = now(),
        sync_version = egg_batches.sync_version + 1
    WHERE egg_batches.id = p_batch_id;

    INSERT INTO hatch_results (
        batch_id,
        total_set,
        total_hatched,
        total_culled,
        hatch_rate,
        recorded_by,
        recorded_at,
        created_at,
        sync_version
    )
    VALUES (
        p_batch_id,
        v_loaded_eggs,
        p_hatched_count,
        v_total_culled,
        v_hatch_rate,
        p_recorded_by,
        now(),
        now(),
        1
    )
    ON CONFLICT (batch_id) DO UPDATE
    SET total_set = EXCLUDED.total_set,
        total_hatched = EXCLUDED.total_hatched,
        total_culled = EXCLUDED.total_culled,
        hatch_rate = EXCLUDED.hatch_rate,
        recorded_by = EXCLUDED.recorded_by,
        recorded_at = EXCLUDED.recorded_at,
        sync_version = hatch_results.sync_version + 1
    RETURNING id INTO v_hatch_result_id;

    DELETE FROM batch_incubator_allocations
    WHERE batch_incubator_allocations.batch_id = p_batch_id;

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
        v_log_type,
        v_log_notes,
        p_recorded_by,
        now(),
        now(),
        1
    );

    hatch_result_id := v_hatch_result_id;
    total_set := v_loaded_eggs;
    total_hatched := p_hatched_count;
    total_culled := v_total_culled;
    hatch_rate := v_hatch_rate;
    RETURN NEXT;
END;
$$;
