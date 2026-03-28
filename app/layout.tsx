import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { DevAgentation } from '@/components/dev-agentation'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LiciTrack',
  description: 'Sistema de tracking de contratos de licitación',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {children}
        <DevAgentation />
      </body>
    </html>
  )
}
