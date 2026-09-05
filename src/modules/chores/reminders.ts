import { notify } from '#/core/notify/notify'
import { getChore, listPendingOccurrencesForChore } from '#/modules/chores/repo'
import { computeReminderAt } from './reminder-time'
import { formatDateWithWeekday } from './time'

/**
 * Schedules a Telegram reminder (via notify()) for every pending occurrence
 * of a chore, if the chore has reminders enabled and the occurrence has an
 * assignee. Called both right after materializing (create/edit — so a
 * reminder for a chore due tomorrow is scheduled immediately, not after the
 * next nightly cron) and from the nightly `chores.materialize` job for
 * every household. Safe to call repeatedly — see notify()'s dedupe note.
 */
export async function scheduleRemindersForChore(
  choreId: string,
  householdId: string,
  timezone: string,
): Promise<void> {
  const chore = await getChore(choreId, householdId)
  if (!chore || chore.reminderLeadMinutes == null) return

  const occurrences = await listPendingOccurrencesForChore(choreId, householdId)
  for (const occurrence of occurrences) {
    if (!occurrence.assigneeUserId) continue
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
        chore.reminderLeadMinutes,
      ),
      dedupeKey: `chore-occ:${occurrence.id}:reminder`,
    })
  }
}
