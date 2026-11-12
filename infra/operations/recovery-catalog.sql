-- Metadata only. Never derive the approved value from the restored target.
-- Stable across pg_dump/restore on the pinned PostgreSQL/extension image.
SET search_path = pg_catalog, public;
WITH app_namespaces AS (
  SELECT oid, nspname FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
), items AS (
  SELECT jsonb_build_array('namespace', nspname) AS value FROM app_namespaces
  UNION ALL
  SELECT jsonb_build_array('relation', n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity)
  FROM pg_class c JOIN app_namespaces n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  UNION ALL
  -- pg_dump omits dropped columns, so physical attnum holes disappear.
  -- Compare the order of surviving columns, retaining names/types/defaults.
  SELECT jsonb_build_array('column', n.nspname, c.relname,
    row_number() OVER (PARTITION BY c.oid ORDER BY a.attnum), a.attname,
    format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attidentity, a.attgenerated,
    pg_get_expr(d.adbin, d.adrelid), co.collname)
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
  JOIN app_namespaces n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  LEFT JOIN pg_collation co ON co.oid = a.attcollation
  WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  UNION ALL
  SELECT jsonb_build_array('constraint', n.nspname, c.relname, x.conname,
    pg_get_constraintdef(x.oid, false), x.convalidated)
  FROM pg_constraint x JOIN pg_class c ON c.oid = x.conrelid
  JOIN app_namespaces n ON n.oid = c.relnamespace
  UNION ALL
  SELECT jsonb_build_array('index', n.nspname, c.relname, pg_get_indexdef(i.indexrelid))
  FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN app_namespaces n ON n.oid = c.relnamespace
  UNION ALL
  -- ADD VALUE BEFORE/AFTER creates fractional internal sort numbers; restore
  -- renumbers them. Labels and their relative order are the schema contract.
  SELECT jsonb_build_array('enum', n.nspname, t.typname,
    row_number() OVER (PARTITION BY t.oid ORDER BY e.enumsortorder), e.enumlabel)
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN app_namespaces n ON n.oid = t.typnamespace
  UNION ALL
  SELECT jsonb_build_array('function', n.nspname, p.proname, pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN app_namespaces n ON n.oid = p.pronamespace WHERE p.prokind <> 'a'
  UNION ALL
  SELECT jsonb_build_array('trigger', n.nspname, c.relname, pg_get_triggerdef(t.oid, false), t.tgenabled)
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN app_namespaces n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal
  UNION ALL
  SELECT jsonb_build_array('extension', e.extname, e.extversion, n.nspname)
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  UNION ALL
  SELECT jsonb_build_array('migration', migration_name, checksum, finished_at IS NOT NULL, rolled_back_at IS NOT NULL)
  FROM public._prisma_migrations
)
SELECT COALESCE(jsonb_agg(value ORDER BY value::text COLLATE "C"), '[]'::jsonb)::text FROM items;

