import Link from 'next/link'
import { Button } from '@/components/ui/Button'

const FEATURES = [
  {
    title: 'AI-extracted key terms',
    description: 'Upload an NDA or MSA and get standard terms extracted with page-cited evidence.',
  },
  {
    title: 'Ask questions, grounded',
    description: 'Chat about a contract and get answers sourced from the document — or say so plainly.',
  },
  {
    title: 'Review, edit, trust',
    description: 'Every extraction shows its confidence and source sentence, so you always know why.',
  },
]

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-surface-bg">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-xl px-md py-3xl text-center">
        <div className="flex flex-col gap-sm">
          <h1 className="text-display text-text-primary">ContractIQ</h1>
          <p className="mx-auto max-w-xl text-body-lg text-text-secondary">
            AI-powered contract review. Upload an NDA or MSA, get key terms extracted with page citations, and ask
            questions grounded in the document.
          </p>
        </div>

        <div className="flex items-center gap-sm">
          <Link href="/sign-up">
            <Button>Get started</Button>
          </Link>
          <Link href="/sign-in">
            <Button variant="ghost">Sign in</Button>
          </Link>
        </div>

        <div className="grid w-full grid-cols-1 gap-md sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col gap-xs rounded-card border border-border bg-surface-elevated p-lg text-left"
            >
              <h2 className="text-h4 text-text-primary">{feature.title}</h2>
              <p className="text-body text-text-secondary">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
