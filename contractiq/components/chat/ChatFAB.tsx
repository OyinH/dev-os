'use client'

export function ChatFAB({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open contract chat"
      className="fixed bottom-lg right-lg z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-md hover:bg-brand-hover"
    >
      💬
    </button>
  )
}
