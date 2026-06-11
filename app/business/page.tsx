import type { Metadata } from 'next'
import BusinessLanding from './business-landing'

// /business — the public Qift Business front door (entry-experience
// phase). Indexable marketing surface, distinct from /org (the
// logged-in console). Copy follows the approved dual-pillar
// positioning: privacy (live and provable today) + smart corporate
// purchasing (phrased "assembled by Qift in one place" — true in
// concierge mode, grows into the B3 comparison UI without rewrite).

export const metadata: Metadata = {
  title: 'قِفت للأعمال — هدايا الشركات، كما يجب أن تكون',
  description:
    'قارن الموردين والأسعار والكميات ومدد التجهيز في مكان واحد — ويؤكد كل موظف عنوان توصيله بنفسه، فلا تجمع شركتك عناوين موظفيها أبدًا.',
}

export default function BusinessPage() {
  return <BusinessLanding />
}
