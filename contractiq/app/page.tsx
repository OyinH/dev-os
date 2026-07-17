export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] px-8 py-8 text-center text-white">
      <h1 className="mb-4 bg-gradient-to-r from-[#00c6ff] to-[#a78bfa] bg-clip-text text-6xl font-extrabold text-transparent">
        Hello, ContractIQ 🚀
      </h1>
      <p className="mb-8 max-w-xl text-xl leading-relaxed text-[#a8b2d8]">
        Your Next.js 14 app is up and running with the App Router. Let&apos;s build something amazing.
      </p>
      <a
        href="/sign-up"
        className="inline-block rounded-full bg-[#00c6ff] px-8 py-3 text-base font-bold text-[#0f0c29] transition-transform hover:scale-105"
      >
        Get Started
      </a>
    </main>
  )
}
