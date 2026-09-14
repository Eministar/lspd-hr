import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import './lspd-polish.css'
import Providers from './providers'

// Auf Apple-Geräten gewinnt SF Pro im Font-Stack; Inter ist die Entsprechung für Windows.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')

const ogImage = {
  url: '/op-image.png',
  width: 1723,
  height: 913,
  alt: 'LSPD Department Dashboard',
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'LSPD Department Dashboard',
  title: {
    default: 'LSPD Department Dashboard',
    template: '%s · LSPD Department',
  },
  description: 'Department-Verwaltung, Dienstzeiten, Aufgaben und operative Tools des Los Santos Police Department.',
  keywords: [
    'LSPD',
    'Los Santos Police Department',
    'Department Dashboard',
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
    siteName: 'LSPD Department Dashboard',
    title: 'LSPD Department Dashboard',
    description: 'Department-Verwaltung, Dienstzeiten, Aufgaben und operative Tools des Los Santos Police Department.',
    images: [ogImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LSPD Department Dashboard',
    description: 'Department-Verwaltung, Dienstzeiten, Aufgaben und operative Tools des Los Santos Police Department.',
    images: [ogImage],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`dark ${inter.variable}`}>
      <body className="min-h-screen bg-canvas text-label font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
