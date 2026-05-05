import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'LSPD HR Dashboard',
  description: 'Personalverwaltung des Los Santos Police Department',
  icons: {
    icon: '/shield.webp',
    shortcut: '/shield.webp',
    apple: '/shield.webp',
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
