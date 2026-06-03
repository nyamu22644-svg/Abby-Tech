-- Atomic order creation with customer lookup, breed-aware allocation, and audit rows.

CREATE OR REPLACE FUNCTION create_order_atomic(
    p_customer_name text,
    p_customer_phone text DEFAULT NULL,
    p_location text DEFAULT NULL,
    p_quantity integer DEFAULT NULL,
    p_breed_type text DEFAULT NULL,
    p_price_per_chick numeric DEFAULT 130,
    p_discount_amount numeric DEFAULT 0,
    p_expected_hatch_date date DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL
)
RETURNS TABLE (
    order_id uuid,
    customer_id uuid,
    allocated_batch_id uuid,
    order_number text
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id uuid;
    v_tenant_id uuid;
    v_customer_id uuid;
    v_order_id uuid;
    v_order_number text;
    v_allocated_batch_id uuid;
    v_subtotal_amount numeric(12,2);
    v_discount_amount numeric(12,2);
    v_total_amount numeric(12,2);
    v_breed_norm text;
    v_audit_id uuid;
    v_attempt integer := 0;
BEGIN
    IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    IF p_price_per_chick IS NULL OR p_price_per_chick < 0 THEN
        RAISE EXCEPTION 'Price per chick cannot be negative';
    END IF;

    IF p_discount_amount IS NULL OR p_discount_amount < 0 THEN
        RAISE EXCEPTION 'Discount cannot be negative';
    END IF;

    v_user_id := COALESCE(p_created_by, auth.uid());

    SELECT user_profiles.tenant_id
    INTO v_tenant_id
    FROM user_profiles
    WHERE user_profiles.id = v_user_id;

    IF p_customer_phone IS NOT NULL AND btrim(p_customer_phone) <> '' THEN
        SELECT customers.id
        INTO v_customer_id
        FROM customers
        WHERE customers.tenant_id IS NOT DISTINCT FROM v_tenant_id
          AND customers.phone = btrim(p_customer_phone)
          AND customers.deleted_at IS NULL
        ORDER BY customers.created_at DESC
        LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        SELECT customers.id
        INTO v_customer_id
        FROM customers
        WHERE customers.tenant_id IS NOT DISTINCT FROM v_tenant_id
          AND lower(customers.name) = lower(btrim(p_customer_name))
          AND customers.deleted_at IS NULL
        ORDER BY customers.created_at DESC
        LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        INSERT INTO customers (
            tenant_id,
            name,
            phone,
            address,
            created_by,
            created_at,
            updated_at,
            sync_version
        )
        VALUES (
            v_tenant_id,
            btrim(p_customer_name),
            NULLIF(btrim(COALESCE(p_customer_phone, '')), ''),
            NULLIF(btrim(COALESCE(p_location, '')), ''),
            v_user_id,
            now(),
            now(),
            1
        )
        RETURNING customers.id INTO v_customer_id;
    END IF;

    v_subtotal_amount := ROUND((p_quantity::numeric * p_price_per_chick::numeric), 2);
    v_discount_amount := LEAST(ROUND(p_discount_amount::numeric, 2), v_subtotal_amount);
    v_total_amount := GREATEST(v_subtotal_amount - v_discount_amount, 0);
    v_breed_norm := regexp_replace(
        regexp_replace(lower(btrim(COALESCE(p_breed_type, ''))), '[^a-z0-9]+', ' ', 'g'),
        '\s+',
        ' ',
        'g'
    );

    LOCK TABLE order_items IN SHARE ROW EXCLUSIVE MODE;

    WITH allocated AS (
        SELECT order_items.batch_id, COALESCE(SUM(order_items.quantity), 0) AS allocated_count
        FROM order_items
        WHERE order_items.batch_id IS NOT NULL
          AND order_items.status <> 'CANCELLED'
        GROUP BY order_items.batch_id
    ),
    candidates AS (
        SELECT
            egg_batches.id,
            egg_batches.status,
            egg_batches.expected_hatch_date,
            GREATEST(
                CASE
                    WHEN egg_batches.status IN ('COMPLETED', 'BROODER') THEN COALESCE(egg_batches.quantity_hatched, 0)
                    ELSE COALESCE(egg_batches.quantity_set, egg_batches.accepted_eggs, egg_batches.quantity_received, 0)
                         - COALESCE(egg_batches.quantity_culled, 0)
                         - COALESCE(egg_batches.mortality_count, 0)
                END - COALESCE(allocated.allocated_count, 0),
                0
            ) AS available_count,
            regexp_replace(
                regexp_replace(lower(btrim(COALESCE(egg_batches.breed_type, ''))), '[^a-z0-9]+', ' ', 'g'),
                '\s+',
                ' ',
                'g'
            ) AS batch_breed_norm
        FROM egg_batches
        LEFT JOIN allocated ON allocated.batch_id = egg_batches.id
        WHERE egg_batches.deleted_at IS NULL
          AND egg_batches.status NOT IN ('DISCARDED', 'FAILED', 'CANCELLED')
    )
    SELECT candidates.id
    INTO v_allocated_batch_id
    FROM candidates
    WHERE candidates.available_count >= p_quantity
      AND (
        v_breed_norm = ''
        OR candidates.batch_breed_norm = v_breed_norm
        OR candidates.batch_breed_norm LIKE '%' || v_breed_norm || '%'
        OR v_breed_norm LIKE '%' || candidates.batch_breed_norm || '%'
      )
    ORDER BY
        CASE
            WHEN p_expected_hatch_date IS NULL THEN 0
            WHEN candidates.status IN ('COMPLETED', 'BROODER') THEN 0
            WHEN candidates.expected_hatch_date IS NOT NULL AND candidates.expected_hatch_date::date <= p_expected_hatch_date THEN 0
            ELSE 1
        END,
        CASE WHEN candidates.status IN ('COMPLETED', 'BROODER') THEN 0 ELSE 1 END,
        candidates.expected_hatch_date NULLS LAST,
        candidates.available_count ASC
    LIMIT 1;

    LOOP
        v_attempt := v_attempt + 1;
        v_order_number := 'ORD-' || to_char(now(), 'YYYY') || '-' || lpad(floor(random() * 10000)::text, 4, '0');

        BEGIN
            INSERT INTO orders (
                tenant_id,
                order_number,
                customer_id,
                status,
                required_by_date,
                total_quantity,
                subtotal_amount,
                discount_amount,
                total_amount,
                amount_paid,
                balance_due,
                payment_status,
                dispatch_status,
                notes,
                created_by,
                created_at,
                updated_at,
                sync_version
            )
            VALUES (
                v_tenant_id,
                v_order_number,
                v_customer_id,
                CASE WHEN v_allocated_batch_id IS NULL THEN 'INQUIRY'::order_status ELSE 'ALLOCATED'::order_status END,
                p_expected_hatch_date,
                p_quantity,
                v_subtotal_amount,
                v_discount_amount,
                v_total_amount,
                0,
                v_total_amount,
                'PENDING',
                'PENDING',
                NULLIF(btrim(COALESCE(p_notes, '')), ''),
                v_user_id,
                now(),
                now(),
                1
            )
            RETURNING orders.id INTO v_order_id;

            EXIT;
        EXCEPTION
            WHEN unique_violation THEN
                IF v_attempt >= 10 THEN
                    RAISE;
                END IF;
        END;
    END LOOP;

    INSERT INTO order_items (
        order_id,
        batch_id,
        description,
        quantity,
        unit_price,
        total_price,
        status,
        created_at,
        updated_at,
        sync_version
    )
    VALUES (
        v_order_id,
        v_allocated_batch_id,
        CASE
            WHEN NULLIF(btrim(COALESCE(p_breed_type, '')), '') IS NULL THEN 'Day-old chicks'
            ELSE 'Day-old chicks - ' || btrim(p_breed_type)
        END,
        p_quantity,
        p_price_per_chick,
        v_subtotal_amount,
        CASE WHEN v_allocated_batch_id IS NULL THEN 'UNALLOCATED'::order_item_status ELSE 'ALLOCATED'::order_item_status END,
        now(),
        now(),
        1
    );

    INSERT INTO audit_logs (
        tenant_id,
        entity_type,
        entity_id,
        action,
        performed_by,
        performed_at,
        created_at
    )
    VALUES (
        v_tenant_id,
        'order',
        v_order_id,
        'CREATE',
        v_user_id,
        now(),
        now()
    )
    RETURNING audit_logs.id INTO v_audit_id;

    INSERT INTO audit_log_changes (audit_log_id, field_name, old_value, new_value)
    VALUES
        (v_audit_id, 'customer_name', NULL, btrim(p_customer_name)),
        (v_audit_id, 'quantity', NULL, p_quantity::text),
        (v_audit_id, 'breed_type', NULL, NULLIF(btrim(COALESCE(p_breed_type, '')), '')),
        (v_audit_id, 'total_amount', NULL, v_total_amount::text),
        (v_audit_id, 'metadata.resource', NULL, 'orders'),
        (v_audit_id, 'metadata.operation', NULL, 'create');

    IF v_allocated_batch_id IS NOT NULL THEN
        INSERT INTO audit_logs (
            tenant_id,
            entity_type,
            entity_id,
            action,
            performed_by,
            performed_at,
            created_at
        )
        VALUES (
            v_tenant_id,
            'order',
            v_order_id,
            'ALLOCATION',
            v_user_id,
            now(),
            now()
        )
        RETURNING audit_logs.id INTO v_audit_id;

        INSERT INTO audit_log_changes (audit_log_id, field_name, old_value, new_value)
        VALUES
            (v_audit_id, 'allocated_batch_id', NULL, v_allocated_batch_id::text),
            (v_audit_id, 'quantity', NULL, p_quantity::text),
            (v_audit_id, 'metadata.resource', NULL, 'orders'),
            (v_audit_id, 'metadata.operation', NULL, 'batch_allocated'),
            (v_audit_id, 'metadata.batchId', NULL, v_allocated_batch_id::text);
    END IF;

    order_id := v_order_id;
    customer_id := v_customer_id;
    allocated_batch_id := v_allocated_batch_id;
    order_number := v_order_number;
    RETURN NEXT;
END;
$$;
