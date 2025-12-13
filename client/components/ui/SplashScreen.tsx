'use client';

interface SplashScreenProps {
  finishLoading?: boolean;
}

export default function SplashScreen({ finishLoading = false }: SplashScreenProps) {
  return (
    <div
      className={`
        fixed inset-0 z-50 flex flex-col items-center justify-center
        bg-gradient-to-br from-slate-900 to-black
        transition-opacity duration-700 ease-out
        ${finishLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'}
      `}
    >
      <div className="mb-10 animate-pulse">
        <img
          src="/logo.svg"
          alt="Logo"
          className="h-32 w-auto drop-shadow-2xl"
        />
      </div>

      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500" />

      <div className="mt-6 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Initializing Engine...
      </div>
    </div>
  );
}