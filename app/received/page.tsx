import { redirect } from 'next/navigation'

// /received — retired (platform audit Q2). The page was a launch-era
// stub rendering hardcoded sample gifts; the real surface is /gifts,
// which carries the sent/received tabs over live data. Permanent
// redirect preserves old links and history entries.
export default function ReceivedRedirect() {
  redirect('/gifts')
}
