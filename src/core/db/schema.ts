/**
 * The merged schema barrel. Per the module contract (see docs/ and the
 * execution plan §5.2), each module under src/modules/<name>/schema.ts will
 * export its own tables, and this file re-exports them all so drizzle-kit
 * sees one merged migration set. Core (auth, household) tables land here
 * directly since they aren't ModuleManifest modules; chores/shopping land
 * under src/modules/ in M5/M6.
 */
export * from '#/core/auth/schema'
export * from '#/core/household/schema'
export * from '#/modules/chores/schema'
export * from '#/modules/shopping/schema'
