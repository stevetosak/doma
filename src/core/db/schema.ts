/**
 * The merged schema barrel. Per the module contract (see docs/ and the
 * execution plan §5.2), each module under src/modules/<name>/schema.ts will
 * export its own tables, and this file re-exports them all so drizzle-kit
 * sees one merged migration set. Empty at M1 — the identity and household
 * tables land in M2/M4, chores/shopping in M5/M6.
 */
export {}
