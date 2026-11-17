import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Grid3X3,
  LogOut,
  Menu,
  Play,
  RefreshCw,
  Search,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { api } from './lib/api';
import { SignInScreen } from './components/SignInScreen';
import { CentersOverviewView } from './components/CentersOverviewView';
import { RosterAllocatorView } from './components/RosterAllocatorView';
import { RoomMatrixView } from './components/RoomMatrixView';
import { StudentLookupPortal } from './components/StudentLookupPortal';
import type { WorkspaceSnapshot } from './types/exam';

type WorkspaceMode = 'admin' | 'student';
type AdminSection = 'centers' | 'roster' | 'matrix';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

function ConsoleWorkspace() {
  const { user, signOut } = useAuth();
  const [mode, setMode] = useState<WorkspaceMode>('admin');
  const [adminSection, setAdminSection] = useState<AdminSection>('centers');
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number>(0);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickRunning, setQuickRunning] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback(
    (text: string, tone: 'info' | 'success' | 'error' = 'info') => {
      const id = Date.now();
      setToast({ id, text, tone });
      setTimeout(() => {
        setToast((prev) => (prev?.id === id ? null : prev));
      }, 4000);
    },
    []
  );

  const loadWorkspace = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await api.getWorkspace();
      setSnapshot(data);

      setSelectedSessionId((prev) => {
        if (prev && data.sessions.some((s) => s.id === prev)) return prev;
        return data.sessions[0]?.id ?? 0;
      });

      setSelectedRoomId((prev) => {
        if (prev && data.rooms.some((r) => r.id === prev)) return prev;
        return data.rooms[0]?.id ?? null;
      });
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load workspace from database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadWorkspace();
    }
  }, [user, loadWorkspace]);

  const { connected: wsConnected } = useRealtimeSync(user, () => {
    loadWorkspace();
  });

  const activeSession = useMemo(
    () => snapshot?.sessions.find((s) => s.id === selectedSessionId) ?? null,
    [snapshot, selectedSessionId]
  );

  const handleQuickRunAllocation = async () => {
    if (!selectedSessionId) return;
    setQuickRunning(true);
    try {
      const report = await api.runAllocation({
        examSessionId: selectedSessionId,
        strictDiagonal: true,
      });
      await loadWorkspace();
      notify(
        `Auto-allocated ${report.placedCount}/${report.totalStudents} students (${report.orthogonalConflicts} orthogonal conflicts).`,
        'success'
      );
    } catch (err: any) {
      notify(err.message || 'Allocation run failed', 'error');
    } finally {
      setQuickRunning(false);
    }
  };

  const breadcrumbLabel =
    mode === 'student'
      ? 'Student Seat Lookup'
      : adminSection === 'centers'
      ? 'Live Centers & Rooms'
      : adminSection === 'roster'
      ? 'Roster & Auto-Allocator'
      : 'Room Seat Matrix';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0D121F] border-r border-slate-800/90 w-64">
      <div className="px-5 py-5 border-b border-slate-800/80">
        <span className="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap">
          ProctorGrid
        </span>
      </div>

      <div className="p-4 space-y-6 flex-1 overflow-y-auto">
        {/* Workspace Role Switcher */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500 px-1">Workspace</div>
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#090D16] border border-slate-800 rounded-lg">
            <button
              onClick={() => {
                setMode('admin');
                setMobileMenuOpen(false);
              }}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'admin'
                  ? 'bg-slate-800 text-slate-50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Admin Console
            </button>
            <button
              onClick={() => {
                setMode('student');
                setMobileMenuOpen(false);
              }}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'student'
                  ? 'bg-slate-800 text-slate-50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Student Portal
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        {mode === 'admin' ? (
          <nav className="space-y-1">
            <div className="text-xs font-medium text-slate-500 px-1 mb-2">
              Operations
            </div>
            <button
              onClick={() => {
                setAdminSection('centers');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                adminSection === 'centers'
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span>Centers &amp; Rooms</span>
            </button>

            <button
              onClick={() => {
                setAdminSection('roster');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                adminSection === 'roster'
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Roster &amp; Allocator</span>
            </button>

            <button
              onClick={() => {
                setAdminSection('matrix');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                adminSection === 'matrix'
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <Grid3X3 className="w-4 h-4 shrink-0" />
              <span>Room Seat Matrix</span>
            </button>
          </nav>
        ) : (
          <nav className="space-y-1">
            <div className="text-xs font-medium text-slate-500 px-1 mb-2">
              Examinee Tools
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600/15 text-blue-300 border border-blue-500/30 whitespace-nowrap cursor-pointer"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span>Seat Locator</span>
            </button>
          </nav>
        )}

        {/* Active Exam Session Selector */}
        {snapshot && snapshot.sessions.length > 0 && mode === 'admin' && (
          <div className="space-y-2 pt-3 border-t border-slate-800/80">
            <label className="block text-xs font-medium text-slate-500 px-1">
              Exam Session
            </label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(Number(e.target.value))}
              className="w-full bg-[#090D16] border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {snapshot.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            {activeSession && (
              <div className="px-1 text-[11px] font-mono tabular-nums text-slate-400">
                {activeSession.examDate} · {activeSession.timeSlot}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live WebSocket Status & User Account Footer */}
      <div className="p-4 border-t border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            {wsConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Live Sync Active</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400">Reconnecting</span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">
              {user?.displayName || 'Administrator'}
            </div>
            <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
          </div>
          <button
            onClick={signOut}
            title="Sign Out"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumbs left, 1 primary CTA right */}
        <header className="h-16 px-6 border-b border-slate-800/90 bg-[#0D121F]/80 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-400 truncate">
              <span>ProctorGrid</span>
              <span className="mx-2 text-slate-600">/</span>
              <span className="text-slate-100 font-medium">{breadcrumbLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {mode === 'admin' ? (
              <button
                onClick={handleQuickRunAllocation}
                disabled={quickRunning || !selectedSessionId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {quickRunning ? 'Allocating...' : 'Run Auto-Allocation'}
                </span>
              </button>
            ) : (
              <button
                onClick={() => setMode('admin')}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Admin Console
              </button>
            )}
          </div>
        </header>

        {/* Non-blocking Toast Banner */}
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-[#111827] border border-slate-700 rounded-lg px-4 py-3 shadow-lg flex items-center justify-between gap-3 text-xs">
            <span
              className={
                toast.tone === 'error'
                  ? 'text-red-300'
                  : toast.tone === 'success'
                  ? 'text-emerald-300'
                  : 'text-slate-200'
              }
            >
              {toast.text}
            </span>
            <button
              onClick={() => setToast(null)}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Viewport Body */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 rounded-xl bg-[#111827] border border-slate-800 animate-pulse" />
              <div className="h-80 rounded-xl bg-[#111827] border border-slate-800 animate-pulse" />
            </div>
          ) : loadError ? (
            <div className="bg-[#111827] border border-red-900/60 rounded-xl p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="font-display text-base font-semibold text-red-200">
                  Unable to Load Exam Workspace
                </h2>
                <p className="text-sm text-slate-400">{loadError}</p>
              </div>
              <button
                onClick={() => {
                  setLoading(true);
                  loadWorkspace();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          ) : snapshot ? (
            mode === 'student' ? (
              <StudentLookupPortal sampleStudents={snapshot.students} />
            ) : adminSection === 'centers' ? (
              <CentersOverviewView
                centers={snapshot.centers}
                rooms={snapshot.rooms}
                allocations={snapshot.allocations}
                selectedSessionId={selectedSessionId}
                onInspectRoom={(roomId) => {
                  setSelectedRoomId(roomId);
                  setAdminSection('matrix');
                }}
                onRefresh={loadWorkspace}
                onNotify={notify}
              />
            ) : adminSection === 'roster' ? (
              <RosterAllocatorView
                centers={snapshot.centers}
                rooms={snapshot.rooms}
                sessions={snapshot.sessions}
                students={snapshot.students}
                allocations={snapshot.allocations}
                selectedSessionId={selectedSessionId}
                onSelectSession={setSelectedSessionId}
                onInspectRoom={(roomId) => {
                  setSelectedRoomId(roomId);
                  setAdminSection('matrix');
                }}
                onRefresh={loadWorkspace}
                onNotify={notify}
              />
            ) : (
              <RoomMatrixView
                centers={snapshot.centers}
                rooms={snapshot.rooms}
                sessions={snapshot.sessions}
                allocations={snapshot.allocations}
                selectedSessionId={selectedSessionId}
                selectedRoomId={selectedRoomId}
                onSelectRoom={setSelectedRoomId}
                onRefresh={loadWorkspace}
                onNotify={notify}
              />
            )
          ) : null}
        </main>
      </div>
    </div>
  );
}

function RootRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090D16] flex items-center justify-center">
        <div className="text-sm text-slate-400 font-mono">
          Initializing ProctorGrid...
        </div>
      </div>
    );
  }

  if (!user) {
    return <SignInScreen />;
  }

  return <ConsoleWorkspace />;
}

export default function App() {
  return (
    <AuthProvider>
      <RootRouter />
    </AuthProvider>
  );
}
