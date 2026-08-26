import type { Metadata } from 'next'

import { InternalAffairsPersonFiles } from '@/components/internal-affairs/internal-affairs-person-files'

export const metadata: Metadata = {
  title: 'Personenakten · Internal Affairs',
}

export default function InternalAffairsPersonFilesRoute() {
  return <InternalAffairsPersonFiles />
}
