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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[#061426] bg-pattern text-[#edf4fb] font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
