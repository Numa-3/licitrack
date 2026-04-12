import { admin } from '../src/db.js'

async function main() {
  const { count: total } = await admin
    .from('secop_process_changes')
    .select('*', { count: 'exact', head: true })
  console.log('Total changes before:', total)

  // Delete false positive changes from April 11
  const { error, count: deleted } = await admin
    .from('secop_process_changes')
    .delete()
    .gte('detected_at', '2026-04-11T00:00:00Z')
    .lte('detected_at', '2026-04-11T23:59:59Z')

  if (error) { console.error('Error:', error.message); return }
  console.log('Changes deleted:', deleted)

  // Clean notifications from those
  const { error: notifErr, count: notifDeleted } = await admin
    .from('notifications')
    .delete()
    .gte('created_at', '2026-04-11T00:00:00Z')
    .lte('created_at', '2026-04-11T23:59:59Z')

  if (notifErr) console.error('Notif error:', notifErr.message)
  else console.log('Notifications deleted:', notifDeleted)

  const { count: remaining } = await admin
    .from('secop_process_changes')
    .select('*', { count: 'exact', head: true })
  console.log('Remaining changes:', remaining)
}

main()
