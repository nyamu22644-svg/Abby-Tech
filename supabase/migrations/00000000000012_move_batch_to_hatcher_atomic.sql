-- Atomic hatch-prep transfer.

CREATE OR REPLACE FUNCTION move_batch_to_hatcher_atomic(
    p_batch_id uuid,
    p_notes text DEFAULT NULL,
    p_recorded_by uuid DEFAULT NULL
)
RETURNS TABLE (
    batch_id uuid,
    previous_status batch_status,
    status batch_status
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch egg_batches%ROWTYPE;
BEGIN
    SELECT *
    INTO v_batch
    FROM egg_batches
    WHERE egg_batches.id = p_batch_id
      AND egg_batches.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;

    IF v_batch.incubator_id IS NULL OR v_batch.set_date IS NULL OR v_batch.expected_hatch_date IS NULL THEN
        RAISE EXCEPTION 'Place the batch in an incubator before moving it to hatch prep';
    END IF;

    IF now() < v_batch.set_date + interval '18 days' THEN
        RAISE EXCEPTION 'Hatch prep is not due yet';
    END IF;

    IF v_batch.status IN ('COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Closed batches cannot move to hatch prep';
    END IF;

    UPDATE egg_batches
    SET status = 'HATCHER',
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
        'LOCKDOWN_TRANSFER',
        COALESCE(p_notes, 'Batch moved to lockdown / hatch preparation.'),
        p_recorded_by,
        now(),
        now(),
        1
    );

    batch_id := p_batch_id;
    previous_status := v_batch.status;
    status := 'HATCHER';
    RETURN NEXT;
END;
$$;
