import { notify } from '#/core/notify/notify'
import {
  getChore,
  listPendingOccurrencesForChore,
  listRemindersForChore,
} from '#/modules/chores/repo'
import { computeReminderAt } from './reminder-time'
import { formatDateWithWeekday } from './time'

/**
 * Schedules a Telegram reminder (via notify()) for every (pending
 * occurrence x configured reminder) pair of a chore, if the occurrence has
 * an assignee. Called both right after materializing (create/edit — so a
 * reminder for a chore due tomorrow is scheduled immediately, not after
 * the next nightly cron) and from the nightly `chores.materialize` job for
 * every household. Safe to call repeatedly — see notify()'s dedupe note.
 */
export async function scheduleRemindersForChore(
  choreId: string,
  householdId: string,
  timezone: string,
): Promise<void> {
  const chore = await getChore(choreId, householdId)
  if (!chore) return

  const reminders = await listRemindersForChore(choreId, householdId)
  if (reminders.length === 0) return

  const occurrences = await listPendingOccurrencesForChore(choreId, householdId)
  for (const occurrence of occurrences) {
    if (!occurrence.assigneeUserId) continue
    for (const reminder of reminders) {
      await notify({
        householdId,
        userId: occurrence.assigneeUserId,
        moduleId: 'chores',
        kind: 'chore_reminder',
        subjectId: occurrence.id,
        title: `${chore.title} is due`,
        body: `Due ${formatDateWithWeekday(occurrence.dueOn, timezone)}${
          chore.notes ? ` — ${chore.notes}` : ''
        }`,
        deepLink: '/chores',
        at: computeReminderAt(
          occurrence.dueOn,
          timezone,
          reminder.offsetDays,
          reminder.hour,
          reminder.minute,
        ),
        dedupeKey: `chore-occ:${occurrence.id}:reminder:${reminder.id}`,
        existenceCheck: { table: 'chore_reminders', id: reminder.id },
      })
    }
  }
}
