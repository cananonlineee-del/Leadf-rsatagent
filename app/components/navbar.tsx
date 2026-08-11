import Link from 'next/link'

export function Navbar({ showCta = false }: { showCta?: boolean }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#111115]/90 backdrop-blur-md border-b border-white/[0.10] flex items-center px-6">
      <div className="flex items-center gap-2.5 flex-1">
        <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center shrink-0">
          <span className="text-white text-[10px] font-black leading-none">■</span>
        </div>
        <span className="text-white font-bold text-sm tracking-tight">Leadbulucu</span>
      </div>
      <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5 font-medium">
        Beta
      </span>
      {showCta && (
        <Link
          href="/analiz"
          className="ml-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors"
        >
          Uygulamayı Aç
        </Link>
      )}
    </nav>
  )
}
