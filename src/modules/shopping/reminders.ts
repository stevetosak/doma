import { notify } from '#/core/notify/notify'
import { listRemindersForItem } from '#/core/items/repo'

/**
 * Unlike chores' fan-out over pending occurrences, a shopping item has no
 * recurrence — each reminders row schedules exactly one notify() call, at
 * its own stored fireAt. The recipient is whoever set the reminder, not
 * necessarily whoever added the item.
 */
export async function scheduleRemindersForItem(
  itemId: string,
  householdId: string,
  userId: string,
  itemName: string,
): Promise<void> {
  const reminderRows = await listRemindersForItem(itemId, householdId)
  for (const reminder of reminderRows) {
    if (reminder.fireAt == null) continue // not an absolute-mode row — shouldn't happen for a shopping item, but stay defensive
    await notify({
      householdId,
      userId,
      moduleId: 'shopping',
      kind: 'shopping_item_reminder',
      subjectId: itemId,
      title: `Reminder: ${itemName}`,
      body: 'Still on your shopping list.',
      deepLink: '/shopping',
      at: reminder.fireAt,
      dedupeKey: `shopping-item:${itemId}:reminder:${reminder.id}`,
      reminderId: reminder.id,
    })
  }
}
