import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'LSPD HR Dashboard',
  title: {
    default: 'LSPD HR Dashboard',
    template: '%s | LSPD HR Dashboard',
  },
  description: 'Personalverwaltung, Dienstzeiten und Human-Resources-Tools des Los Santos Police Department.',
  keywords: [
    'LSPD',
    'Los Santos Police Department',
    'HR Dashboard',
    'Personalverwaltung',
    'Dienstzeiten',
    'NeroV',
  ],
  icons: {
    icon: '/shield.webp',
    shortcut: '/shield.webp',
    apple: '/shield.webp',
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    url: '/',
    siteName: 'LSPD HR Dashboard',
    title: 'LSPD HR Dashboard',
    description: 'Personalverwaltung, Dienstzeiten und Human-Resources-Tools des Los Santos Police Department.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LSPD HR Dashboard',
    description: 'Personalverwaltung, Dienstzeiten und Human-Resources-Tools des Los Santos Police Department.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-[#061426] bg-pattern text-[#edf4fb] font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
