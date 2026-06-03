-- Atomic order-to-batch allocation.

CREATE OR REPLACE FUNCTION allocate_order_to_batch_atomic(
    p_order_id uuid,
    p_batch_id uuid
)
RETURNS TABLE (
    order_id uuid,
    batch_id uuid,
    allocated_quantity integer,
    available_after_allocation integer
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_batch egg_batches%ROWTYPE;
    v_allocated_elsewhere integer;
    v_base_quantity integer;
    v_available integer;
BEGIN
    LOCK TABLE order_items IN SHARE ROW EXCLUSIVE MODE;

    SELECT *
    INTO v_order
    FROM orders
    WHERE orders.id = p_order_id
      AND orders.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status IN ('DELIVERED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Closed orders cannot be allocated';
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

    IF v_batch.status IN ('DISCARDED', 'FAILED', 'CANCELLED') THEN
        RAISE EXCEPTION 'This batch is not available for allocation';
    END IF;

    SELECT COALESCE(SUM(order_items.quantity), 0)
    INTO v_allocated_elsewhere
    FROM order_items
    WHERE order_items.batch_id = p_batch_id
      AND order_items.order_id <> p_order_id
      AND order_items.status <> 'CANCELLED';

    v_base_quantity := CASE
        WHEN v_batch.status IN ('COMPLETED', 'BROODER') THEN COALESCE(v_batch.quantity_hatched, 0)
        ELSE GREATEST(
            COALESCE(v_batch.quantity_set, v_batch.accepted_eggs, v_batch.quantity_received, 0)
            - COALESCE(v_batch.quantity_culled, 0)
            - COALESCE(v_batch.mortality_count, 0),
            0
        )
    END;

    v_available := GREATEST(v_base_quantity - v_allocated_elsewhere, 0);

    IF v_order.total_quantity > v_available THEN
        RAISE EXCEPTION 'Cannot allocate order. Batch does not have enough available chicks';
    END IF;

    UPDATE order_items
    SET batch_id = p_batch_id,
        status = 'ALLOCATED',
        updated_at = now(),
        sync_version = order_items.sync_version + 1
    WHERE order_items.order_id = p_order_id;

    UPDATE orders
    SET status = 'ALLOCATED',
        updated_at = now(),
        sync_version = orders.sync_version + 1
    WHERE orders.id = p_order_id;

    order_id := p_order_id;
    batch_id := p_batch_id;
    allocated_quantity := v_order.total_quantity;
    available_after_allocation := v_available - v_order.total_quantity;
    RETURN NEXT;
END;
$$;
