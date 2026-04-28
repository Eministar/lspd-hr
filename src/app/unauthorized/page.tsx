import type { Metadata } from 'next'
import { UnauthorizedContent } from '@/components/layout/unauthorized-content'

export const metadata: Metadata = {
  title: 'Kein Zugriff | LSPD HR',
  description: 'Für diesen Bereich fehlt die Berechtigung.',
}

export default function UnauthorizedPage() {
  return <UnauthorizedContent />
}
