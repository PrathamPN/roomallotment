import { Grid3X3, Search, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function SignInScreen() {
  const { signInWithGoogle, error } = useAuth();

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col justify-between px-6 py-8">
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-8 pb-6 border-b border-slate-800/80">
        <span className="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
          ProctorGrid
        </span>
        <span className="text-xs text-slate-400 font-mono whitespace-nowrap shrink-0">
          Exam Seating &amp; Center Operations
        </span>
      </header>

      <main className="max-w-5xl w-full mx-auto my-auto py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 space-y-6">
          <p className="text-xs font-medium tracking-wide text-blue-400">
            Automated Seating Operations · Multi-Center Live Sync
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-slate-50 leading-tight [text-wrap:balance]">
            Zero-conflict exam hall allocation and instant student lookup.
          </h1>
          <p className="text-base text-slate-400 max-w-xl leading-relaxed">
            Configure exam centers and room matrices, interleave student cohorts to prevent adjacent course or department matching, and monitor real-time seat availability across every campus hall.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
            <div className="pt-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Interleaved Engine</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Separates identical courses and branches across orthogonal and diagonal seats.
              </p>
            </div>
            <div className="pt-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Grid3X3 className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Live Hall Matrices</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Toggle maintenance blocks, swap seats manually, and track check-ins live.
              </p>
            </div>
            <div className="pt-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Search className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Student Lookup</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Examinees locate their center, hall, and exact seat row-column in seconds.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="font-display text-xl font-semibold text-slate-50">
                Access Operations Console
              </h2>
              <p className="text-sm text-slate-400">
                Sign in with your Google account to manage exam centers, run automated seating plans, or open the student seat lookup portal.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/60 text-xs text-red-200">
                {error}
              </div>
            )}

            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Continue with Google</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-xs text-slate-500 leading-relaxed">
              Protected by Firebase Authentication and Cloud SQL relational constraints to prevent double-booked seats.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <span>ProctorGrid Operations Console</span>
        <span>PostgreSQL Relational Persistence · WebSocket Live Availability</span>
      </footer>
    </div>
  );
}
