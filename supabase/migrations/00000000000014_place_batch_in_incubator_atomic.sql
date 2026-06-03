-- Atomic incubator placement.

CREATE OR REPLACE FUNCTION place_batch_in_incubator_atomic(
    p_batch_id uuid,
    p_incubator_id uuid,
    p_set_date timestamp with time zone DEFAULT now(),
    p_assigned_by uuid DEFAULT NULL
)
RETURNS TABLE (
    batch_id uuid,
    incubator_id uuid,
    eggs_placed integer,
    placement_summary text
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch egg_batches%ROWTYPE;
    v_incubator incubators%ROWTYPE;
    v_columns integer;
    v_rows integer;
    v_eggs_per_slot integer;
    v_eggs_to_place integer;
    v_remaining integer;
    v_column integer;
    v_row integer;
    v_occupied integer;
    v_available integer;
    v_eggs_allocated integer;
    v_slot_text text := '';
    v_summary text;
BEGIN
    LOCK TABLE batch_incubator_allocations IN SHARE ROW EXCLUSIVE MODE;

    SELECT *
    INTO v_batch
    FROM egg_batches
    WHERE egg_batches.id = p_batch_id
      AND egg_batches.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;

    SELECT *
    INTO v_incubator
    FROM incubators
    WHERE incubators.id = p_incubator_id
      AND incubators.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected incubator was not found';
    END IF;

    IF v_incubator.operational_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Selected incubator is not active';
    END IF;

    IF v_batch.status IN ('COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Closed batches cannot be placed';
    END IF;

    v_columns := COALESCE(v_incubator.columns_count, 6);
    v_rows := COALESCE(v_incubator.tray_rows, 2);
    v_eggs_per_slot := COALESCE(v_incubator.eggs_per_slot, 88);
    v_eggs_to_place := COALESCE(v_batch.accepted_eggs, v_batch.quantity_received, 0);

    IF v_eggs_to_place <= 0 THEN
        RAISE EXCEPTION 'Batch has no accepted eggs to place';
    END IF;

    DELETE FROM batch_incubator_allocations
    WHERE batch_incubator_allocations.batch_id = p_batch_id;

    v_remaining := v_eggs_to_place;

    FOR v_column IN 1..v_columns LOOP
        FOR v_row IN 1..v_rows LOOP
            EXIT WHEN v_remaining <= 0;

            SELECT COALESCE(SUM(batch_incubator_allocations.eggs_allocated), 0)
            INTO v_occupied
            FROM batch_incubator_allocations
            WHERE batch_incubator_allocations.incubator_id = p_incubator_id
              AND batch_incubator_allocations.column_number = v_column
              AND batch_incubator_allocations.row_number = v_row;

            v_available := GREATEST(v_eggs_per_slot - v_occupied, 0);
            IF v_available <= 0 THEN
                CONTINUE;
            END IF;

            v_eggs_allocated := LEAST(v_remaining, v_available);

            INSERT INTO batch_incubator_allocations (
                batch_id,
                incubator_id,
                column_number,
                row_number,
                slot_capacity,
                eggs_allocated,
                assigned_by,
                assigned_at,
                created_at,
                sync_version
            )
            VALUES (
                p_batch_id,
                p_incubator_id,
                v_column,
                v_row,
                v_eggs_per_slot,
                v_eggs_allocated,
                p_assigned_by,
                now(),
                now(),
                1
            );

            v_slot_text := concat_ws(
                ', ',
                NULLIF(v_slot_text, ''),
                'Unit ' || v_column::text || ', Tray ' || v_row::text || ' ' || v_eggs_allocated::text || ' eggs'
            );
            v_remaining := v_remaining - v_eggs_allocated;
        END LOOP;
        EXIT WHEN v_remaining <= 0;
    END LOOP;

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Incubator does not have enough free tray space';
    END IF;

    v_summary := 'Placed ' || v_eggs_to_place::text || ' eggs in ' || v_incubator.name || ': ' || v_slot_text || '.';

    UPDATE egg_batches
    SET incubator_id = p_incubator_id,
        status = 'SETTER',
        quantity_set = v_eggs_to_place,
        set_date = p_set_date,
        expected_hatch_date = p_set_date + interval '21 days',
        placement_summary = v_summary,
        updated_at = now(),
        sync_version = egg_batches.sync_version + 1
    WHERE egg_batches.id = p_batch_id;

    IF p_assigned_by IS NOT NULL THEN
        INSERT INTO batch_incubation_assignments (
            batch_id,
            incubator_id,
            responsible_technician,
            set_date,
            expected_hatch_date,
            assignment_notes,
            assigned_by,
            assigned_at,
            status,
            created_at,
            updated_at,
            sync_version
        )
        VALUES (
            p_batch_id,
            p_incubator_id,
            p_assigned_by,
            p_set_date,
            p_set_date + interval '21 days',
            v_summary,
            p_assigned_by,
            now(),
            'ASSIGNED',
            now(),
            now(),
            1
        );
    END IF;

    batch_id := p_batch_id;
    incubator_id := p_incubator_id;
    eggs_placed := v_eggs_to_place;
    placement_summary := v_summary;
    RETURN NEXT;
END;
$$;
