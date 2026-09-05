/**
 * pg-boss queue names, in one place so the bootstrap registration
 * (src/core/jobs/bootstrap.ts) and every producer/consumer agree.
 */
export const NOTIFY_DISPATCH_QUEUE = 'notify.dispatch'
export const NOTIFY_RETRY_FAILED_QUEUE = 'notify.retry-failed'
export const CHORES_MATERIALIZE_QUEUE = 'chores.materialize'
