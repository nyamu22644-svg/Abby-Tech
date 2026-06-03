-- Atomic order handover completion.

CREATE OR REPLACE FUNCTION complete_order_handover_atomic(
    p_order_id uuid,
    p_handover_type text,
    p_contact_name text,
    p_contact_phone text DEFAULT NULL,
    p_vehicle_number text DEFAULT NULL,
    p_handover_quantity integer DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS TABLE (
    dispatch_id uuid,
    handover_quantity integer,
    remaining_quantity integer,
    order_status order_status,
    dispatch_status dispatch_status
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_has_allocation boolean;
    v_already_taken integer;
    v_remaining integer;
    v_handover_quantity integer;
    v_closes_order boolean;
    v_dispatch_id uuid;
    v_order_status order_status;
    v_dispatch_status dispatch_status;
    v_notes text;
BEGIN
    IF p_handover_type NOT IN ('PICKUP', 'DELIVERY') THEN
        RAISE EXCEPTION 'Invalid handover type';
    END IF;

    IF p_contact_name IS NULL OR btrim(p_contact_name) = '' THEN
        RAISE EXCEPTION 'Collector or recipient name is required';
    END IF;

    SELECT *
    INTO v_order
    FROM orders
    WHERE orders.id = p_order_id
      AND orders.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.payment_status <> 'PAID' THEN
        RAISE EXCEPTION 'Customer must fully pay before pickup or delivery';
    END IF;

    IF v_order.status IN ('DELIVERED', 'CANCELLED') THEN
        RAISE EXCEPTION 'This order is already closed';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM order_items
        WHERE order_items.order_id = p_order_id
          AND order_items.batch_id IS NOT NULL
          AND order_items.status <> 'CANCELLED'
    )
    INTO v_has_allocation;

    IF NOT v_has_allocation THEN
        RAISE EXCEPTION 'Allocate this order to a batch before pickup or delivery';
    END IF;

    SELECT COALESCE(SUM(order_dispatches.handover_quantity), 0)
    INTO v_already_taken
    FROM order_dispatches
    WHERE order_dispatches.order_id = p_order_id;

    v_remaining := GREATEST(v_order.total_quantity - v_already_taken, 0);
    IF v_remaining <= 0 THEN
        RAISE EXCEPTION 'All chicks for this order have already been handed over';
    END IF;

    v_handover_quantity := COALESCE(p_handover_quantity, v_remaining);
    IF v_handover_quantity <= 0 THEN
        RAISE EXCEPTION 'Handover quantity must be greater than zero';
    END IF;

    IF v_handover_quantity > v_remaining THEN
        RAISE EXCEPTION 'Handover quantity exceeds remaining order quantity';
    END IF;

    v_closes_order := v_handover_quantity = v_remaining;
    v_order_status := CASE
        WHEN v_closes_order THEN 'DELIVERED'::order_status
        ELSE 'READY_FOR_DISPATCH'::order_status
    END;
    v_dispatch_status := CASE
        WHEN v_closes_order THEN 'DELIVERED'::dispatch_status
        ELSE 'SCHEDULED'::dispatch_status
    END;
    v_notes := concat_ws(
        ' ',
        CASE WHEN p_handover_type = 'PICKUP' THEN 'Pickup recorded.' ELSE 'Delivery recorded.' END,
        v_handover_quantity::text || ' chicks handed over.',
        p_notes
    );

    INSERT INTO order_dispatches (
        order_id,
        status,
        carrier,
        vehicle_number,
        driver_name,
        driver_phone,
        handover_quantity,
        scheduled_at,
        dispatched_at,
        delivered_at,
        notes,
        created_at,
        updated_at,
        sync_version
    )
    VALUES (
        p_order_id,
        'DELIVERED',
        p_handover_type,
        p_vehicle_number,
        p_contact_name,
        p_contact_phone,
        v_handover_quantity,
        now(),
        now(),
        now(),
        v_notes,
        now(),
        now(),
        1
    )
    RETURNING id INTO v_dispatch_id;

    UPDATE orders
    SET status = v_order_status,
        dispatch_status = v_dispatch_status,
        updated_at = now(),
        sync_version = orders.sync_version + 1
    WHERE orders.id = p_order_id;

    IF v_closes_order THEN
        UPDATE order_items
        SET status = 'FULFILLED',
            updated_at = now(),
            sync_version = order_items.sync_version + 1
        WHERE order_items.order_id = p_order_id;
    END IF;

    dispatch_id := v_dispatch_id;
    handover_quantity := v_handover_quantity;
    remaining_quantity := v_remaining - v_handover_quantity;
    order_status := v_order_status;
    dispatch_status := v_dispatch_status;
    RETURN NEXT;
END;
$$;
