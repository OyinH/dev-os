import type { Metadata } from 'next'
import '../styles/globals.css'
import { QueryProvider } from '@/lib/providers/QueryProvider'
import { Toaster } from '@/components/ui/Toaster'

export const metadata: Metadata = {
  title: 'ContractIQ',
  description: 'Built with Next.js 14 App Router',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
        <Toaster />
      </body>
    </html>
  )
}
