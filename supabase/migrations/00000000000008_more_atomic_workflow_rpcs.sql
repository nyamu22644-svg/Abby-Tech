-- Atomic order payment recording.

CREATE OR REPLACE FUNCTION record_order_payment_atomic(
    p_order_id uuid,
    p_amount numeric,
    p_payment_method payment_method,
    p_transaction_reference text DEFAULT NULL,
    p_recorded_by uuid DEFAULT NULL
)
RETURNS TABLE (
    payment_id uuid,
    amount_paid numeric,
    balance_due numeric,
    payment_status payment_status,
    order_status order_status
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_payment_id uuid;
    v_new_amount_paid numeric(12,2);
    v_new_balance numeric(12,2);
    v_new_payment_status payment_status;
    v_new_order_status order_status;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
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

    IF v_order.status IN ('CANCELLED', 'DELIVERED') THEN
        RAISE EXCEPTION 'Closed orders cannot receive payments';
    END IF;

    IF p_amount > v_order.balance_due THEN
        RAISE EXCEPTION 'Payment cannot exceed outstanding balance';
    END IF;

    v_new_amount_paid := v_order.amount_paid + p_amount;
    v_new_balance := GREATEST(v_order.total_amount - v_new_amount_paid, 0);
    v_new_payment_status := CASE
        WHEN v_new_balance = 0 AND v_order.total_amount > 0 THEN 'PAID'::payment_status
        WHEN v_new_amount_paid > 0 THEN 'PARTIAL'::payment_status
        ELSE 'PENDING'::payment_status
    END;
    v_new_order_status := CASE
        WHEN v_order.status = 'INQUIRY' AND v_new_amount_paid > 0 THEN 'RESERVED'::order_status
        ELSE v_order.status
    END;

    INSERT INTO order_payments (
        order_id,
        payment_method,
        status,
        amount,
        transaction_reference,
        paid_at,
        recorded_by,
        recorded_at,
        created_at,
        sync_version
    )
    VALUES (
        p_order_id,
        p_payment_method,
        'COMPLETED',
        p_amount,
        p_transaction_reference,
        now(),
        p_recorded_by,
        now(),
        now(),
        1
    )
    RETURNING id INTO v_payment_id;

    UPDATE orders
    SET amount_paid = v_new_amount_paid,
        balance_due = v_new_balance,
        payment_status = v_new_payment_status,
        status = v_new_order_status,
        updated_at = now(),
        sync_version = orders.sync_version + 1
    WHERE orders.id = p_order_id;

    payment_id := v_payment_id;
    amount_paid := v_new_amount_paid;
    balance_due := v_new_balance;
    payment_status := v_new_payment_status;
    order_status := v_new_order_status;
    RETURN NEXT;
END;
$$;
