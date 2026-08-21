Run `schema.sql` against PostgreSQL, then generate monthly dues with:

```sql
INSERT INTO maintenance_dues (flat_id, due_month, amount)
SELECT id, DATE '2026-08-01', 1500 FROM flats
ON CONFLICT (flat_id, due_month) DO NOTHING;
```

Import real owners and historical months into `flats` and `maintenance_dues`; do not store pending months as a CSV string.
