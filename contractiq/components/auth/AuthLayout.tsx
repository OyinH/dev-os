export function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-subtle px-md">
      <div className="w-full max-w-[400px] rounded-card border border-border bg-surface-elevated p-xl">
        <h1 className="mb-lg text-h2 text-text-primary">{title}</h1>
        {children}
      </div>
    </main>
  )
}
