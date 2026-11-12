-- Read-only checks for source 2e56def. Output is one boolean, never row contents.
-- Historical product/service labels, prices and membership are not current-state rules.
WITH parents AS (
  SELECT * FROM public."InventoryOperation"
  WHERE response->>'kind' = 'APPOINTMENT_CONSUMPTION'
), children AS (
  SELECT * FROM public."InventoryOperation"
  WHERE response->>'kind' = 'APPOINTMENT_MATERIAL'
), lines AS (
  SELECT p.id AS parent_id, p."businessId", line
  FROM parents p CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.response->'items') = 'array' THEN p.response->'items' ELSE '[]'::jsonb END
  ) AS item(line)
), ledger AS (
  SELECT "businessId", "productId",
    sum(CASE WHEN direction = 'IN' THEN quantity ELSE -quantity END) AS balance
  FROM public."InventoryMovement" GROUP BY "businessId", "productId"
)
SELECT
  NOT EXISTS (
    SELECT FROM public."CatalogProduct" p
    LEFT JOIN ledger l ON l."businessId" = p."businessId" AND l."productId" = p.id
    WHERE p."stockQuantity" IS DISTINCT FROM COALESCE(l.balance, 0)
      OR p."stockQuantity" < 0
      OR p."stockQuantity"::text IN ('NaN','Infinity','-Infinity')
      OR p.price::text IN ('NaN','Infinity','-Infinity')
      OR p."lowStockThreshold"::text IN ('NaN','Infinity','-Infinity')
      OR (p.unit = 'UNIT' AND p."stockQuantity" <> trunc(p."stockQuantity"))
  )
  AND NOT EXISTS (
    SELECT FROM public."InventoryMovement" m
    LEFT JOIN public."CatalogProduct" p ON p.id = m."productId" AND p."businessId" = m."businessId"
    LEFT JOIN public."InventoryOperation" o ON o.id = m."operationId" AND o."businessId" = m."businessId"
    WHERE p.id IS NULL OR o.id IS NULL OR o.type <> 'MOVEMENT'
      OR m.quantity <= 0 OR m."quantityAfter" < 0
      OR m.quantity::text IN ('NaN','Infinity','-Infinity') OR m."quantityAfter"::text IN ('NaN','Infinity','-Infinity')
      OR (p.unit = 'UNIT' AND (m.quantity <> trunc(m.quantity) OR m."quantityAfter" <> trunc(m."quantityAfter")))
      OR o.response->>'movementId' IS DISTINCT FROM m.id
      OR o.response->>'productId' IS DISTINCT FROM p.id
      OR o.response->>'unit' IS DISTINCT FROM p.unit::text
      OR jsonb_typeof(o.response->'quantityAfter') IS DISTINCT FROM 'string'
      OR CASE WHEN o.response->>'quantityAfter' ~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
           THEN (o.response->>'quantityAfter')::numeric END IS DISTINCT FROM m."quantityAfter"
  )
  AND NOT EXISTS (
    SELECT FROM public."InventoryOperation" o
    LEFT JOIN public."User" u ON u.id = o."actorId"
    WHERE u.id IS NULL OR jsonb_typeof(o.response) IS DISTINCT FROM 'object'
      OR (o.response ? 'kind' AND COALESCE(o.response->>'kind', '') NOT IN ('APPOINTMENT_CONSUMPTION', 'APPOINTMENT_MATERIAL'))
      OR (o.type = 'MOVEMENT' AND o.response->>'kind' IS DISTINCT FROM 'APPOINTMENT_CONSUMPTION'
        AND NOT EXISTS (SELECT FROM public."InventoryMovement" m WHERE m."operationId" = o.id AND m."businessId" = o."businessId"))
      OR (o.type = 'IMPORT' AND (
        o.response ? 'kind' OR jsonb_typeof(o.response->'ids') IS DISTINCT FROM 'array'
        OR EXISTS (SELECT FROM public."InventoryMovement" m WHERE m."operationId" = o.id)
        OR EXISTS (
          SELECT FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.response->'ids') = 'array' THEN o.response->'ids' ELSE '[]'::jsonb END) AS ids(value)
          WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
            OR NOT EXISTS (SELECT FROM public."CatalogProduct" p WHERE p.id = value #>> '{}' AND p."businessId" = o."businessId")
        )
      ))
  )
  AND NOT EXISTS (
    SELECT FROM public."Appointment" a
    LEFT JOIN public."Service" s ON s.id = a."serviceId" AND s."businessId" = a."businessId"
    LEFT JOIN public."Customer" c ON c.id = a."customerId"
    LEFT JOIN public."BusinessCustomer" bc ON bc.id = a."businessCustomerId" AND bc."businessId" = a."businessId"
    LEFT JOIN public."Staff" st ON st.id = a."staffId" AND st."businessId" = a."businessId"
    LEFT JOIN public."BusinessMember" bm ON bm.id = a."staffMemberId" AND bm."businessId" = a."businessId"
    LEFT JOIN public."Location" l ON l.id = a."locationId" AND l."businessId" = a."businessId"
    WHERE s.id IS NULL OR c.id IS NULL
      OR (a."businessCustomerId" IS NOT NULL AND bc.id IS NULL)
      OR (a."staffId" IS NOT NULL AND st.id IS NULL)
      OR (a."staffMemberId" IS NOT NULL AND bm.id IS NULL)
      OR (a."locationId" IS NOT NULL AND l.id IS NULL)
  )
  AND NOT EXISTS (
    SELECT FROM parents p
    LEFT JOIN public."Appointment" a ON a.id = p.response->>'appointmentId' AND a."businessId" = p."businessId"
    WHERE p.type <> 'MOVEMENT' OR a.id IS NULL OR a.status <> 'COMPLETED'
      OR p.response->>'operationId' IS DISTINCT FROM p.id
      OR p.response->>'serviceId' IS DISTINCT FROM a."serviceId"
      OR p."keyHash" IS DISTINCT FROM encode(sha256(convert_to('appointment-consumption', 'UTF8') || decode('00','hex') || convert_to(a.id, 'UTF8')), 'hex')
      OR jsonb_typeof(p.response->'items') IS DISTINCT FROM 'array'
      OR (SELECT count(*) FROM lines l WHERE l.parent_id = p.id) NOT BETWEEN 1 AND 50
      OR (SELECT count(*) FROM lines l WHERE l.parent_id = p.id) IS DISTINCT FROM
         (SELECT count(DISTINCT l.line->>'productId') FROM lines l WHERE l.parent_id = p.id)
      OR EXISTS (SELECT FROM public."InventoryMovement" m WHERE m."operationId" = p.id)
  )
  AND NOT EXISTS (
    SELECT FROM lines l
    JOIN parents p ON p.id = l.parent_id
    LEFT JOIN public."InventoryMovement" m ON m.id = l.line->>'movementId' AND m."businessId" = p."businessId"
    LEFT JOIN children c ON c.id = m."operationId" AND c."businessId" = p."businessId"
    WHERE jsonb_typeof(l.line) IS DISTINCT FROM 'object' OR m.id IS NULL OR c.id IS NULL
      OR c."actorId" IS DISTINCT FROM p."actorId"
      OR c.response->>'parentOperationId' IS DISTINCT FROM p.id
      OR c.response->>'appointmentId' IS DISTINCT FROM p.response->>'appointmentId'
      OR c.response->>'serviceId' IS DISTINCT FROM p.response->>'serviceId'
      OR c.response->>'serviceName' IS DISTINCT FROM p.response->>'serviceName'
      OR l.line IS DISTINCT FROM (c.response - ARRAY['kind','parentOperationId','appointmentId','serviceId','serviceName'])
      OR m.direction <> 'OUT' OR m.reason IS DISTINCT FROM p.response->>'reason'
      OR jsonb_typeof(l.line->'quantity') IS DISTINCT FROM 'string'
      OR CASE WHEN l.line->>'quantity' ~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
           THEN (l.line->>'quantity')::numeric END IS DISTINCT FROM m.quantity
  )
  AND NOT EXISTS (
    SELECT FROM children c
    LEFT JOIN parents p ON p.id = c.response->>'parentOperationId' AND p."businessId" = c."businessId"
    WHERE c.type <> 'MOVEMENT' OR p.id IS NULL
      OR c."keyHash" IS DISTINCT FROM encode(sha256(convert_to('appointment-material','UTF8') || decode('00','hex') || convert_to(c.response->>'appointmentId','UTF8') || decode('00','hex') || convert_to(c.response->>'productId','UTF8')), 'hex')
      OR (SELECT count(*) FROM lines l WHERE l.parent_id = p.id AND l.line->>'movementId' = c.response->>'movementId') <> 1
  )
  AND NOT EXISTS (
    SELECT FROM public."B2BQuoteRequest" q
    LEFT JOIN public."Business" b ON b.id = q."buyerBusinessId"
    LEFT JOIN public."Business" s ON s.id = q."supplierBusinessId"
    LEFT JOIN public."CatalogProduct" p ON p.id = q."productId" AND p."businessId" = q."supplierBusinessId"
    LEFT JOIN public."User" requester ON requester.id = q."requestedBy"
    LEFT JOIN public."User" responder ON responder.id = q."respondedBy"
    WHERE b.id IS NULL OR s.id IS NULL OR p.id IS NULL OR requester.id IS NULL
      OR (q."respondedBy" IS NOT NULL AND responder.id IS NULL)
      OR q."buyerBusinessId" = q."supplierBusinessId" OR q.quantity <= 0
      OR q.quantity::text IN ('NaN','Infinity','-Infinity') OR q."quotedUnitPrice"::text IN ('NaN','Infinity','-Infinity')
      OR q.unit IS DISTINCT FROM p.unit OR q.sku IS DISTINCT FROM p.sku
      OR (q.unit = 'UNIT' AND q.quantity <> trunc(q.quantity))
      OR (q.status = 'QUOTED' AND (q."quotedUnitPrice" IS NULL OR q.currency IS NULL OR q."respondedBy" IS NULL))
  );
