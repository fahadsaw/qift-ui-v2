'use client'

import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { useI18n } from '@/lib/i18n'

export default function NotFound() {
  const { t } = useI18n()
  return (
    <PageContainer>
      <section className="flex flex-col pt-16">
        <PageHeading
          badge={<Badge>{t('notfound.badge')}</Badge>}
          line1={t('notfound.title_1')}
          gradient={t('notfound.title_2')}
          subtitle={t('notfound.subtitle')}
        />
        <div className="mt-8">
          <PrimaryButton href="/">{t('notfound.cta')}</PrimaryButton>
        </div>
      </section>
    </PageContainer>
  )
}
