import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'API-Dokumentation',
  description: 'Vollständige Public API für das LSPD HR Dashboard. Bearer-Token-Auth, OpenAPI 3.1, Try-it-out.',
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
