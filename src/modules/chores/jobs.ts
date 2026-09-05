import { listActiveChoresAcrossHouseholds } from './repo'
import { materializeChoreOccurrences } from './materialize'
import { scheduleRemindersForChore } from './reminders'

/**
 * The `chores.materialize` nightly cron's work (§7 M8, §5.5) — keeps every
 * household's occurrence window rolling forward and (re)schedules
 * reminders for anything still pending. M5 only ever materialized
 * synchronously on chore create/edit; nothing kept the window moving day
 * to day until this job existed.
 */
export async function materializeAllHouseholds(): Promise<void> {
  const activeChores = await listActiveChoresAcrossHouseholds()
  for (const { choreId, householdId, timezone } of activeChores) {
    await materializeChoreOccurrences(choreId, householdId, timezone)
    await scheduleRemindersForChore(choreId, householdId, timezone)
  }
}
