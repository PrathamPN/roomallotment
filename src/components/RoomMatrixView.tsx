import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import { analyzeRoomConflicts, formatSeatLabel, makeSeatCoordKey } from '../lib/allocator';
import { api } from '../lib/api';
import type {
  ExamCenter,
  ExamRoom,
  ExamSession,
  SeatAllocationItem,
} from '../types/exam';

type MatrixInteractionMode = 'swap' | 'checkin' | 'block';

interface RoomMatrixViewProps {
  centers: ExamCenter[];
  rooms: ExamRoom[];
  sessions: ExamSession[];
  allocations: SeatAllocationItem[];
  selectedSessionId: number;
  selectedRoomId: number | null;
  onSelectRoom: (roomId: number) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

const COURSE_ACCENT_STYLES = [
  'border-blue-500/40 bg-blue-950/35 text-blue-100',
  'border-emerald-500/40 bg-emerald-950/35 text-emerald-100',
  'border-amber-500/40 bg-amber-950/35 text-amber-100',
  'border-cyan-500/40 bg-cyan-950/35 text-cyan-100',
  'border-violet-500/40 bg-violet-950/35 text-violet-100',
  'border-rose-500/40 bg-rose-950/35 text-rose-100',
];

function getCourseStyle(courseCode: string): string {
  let hash = 0;
  for (let i = 0; i < courseCode.length; i++) {
    hash = (hash * 31 + courseCode.charCodeAt(i)) | 0;
  }
  return COURSE_ACCENT_STYLES[Math.abs(hash) % COURSE_ACCENT_STYLES.length];
}

export function RoomMatrixView({
  centers,
  rooms,
  sessions,
  allocations,
  selectedSessionId,
  selectedRoomId,
  onSelectRoom,
  onRefresh,
  onNotify,
}: RoomMatrixViewProps) {
  const [mode, setMode] = useState<MatrixInteractionMode>('swap');
  const [selectedSeat, setSelectedSeat] = useState<{ row: number; col: number } | null>(
    null
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const activeRoom = useMemo(() => {
    if (rooms.length === 0) return null;
    return rooms.find((r) => r.id === selectedRoomId) ?? rooms[0];
  }, [rooms, selectedRoomId]);

  const centerMap = useMemo(
    () => new Map(centers.map((c) => [c.id, c])),
    [centers]
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  const roomAllocations = useMemo(() => {
    if (!activeRoom) return [];
    return allocations.filter(
      (a) => a.roomId === activeRoom.id && a.examSessionId === selectedSessionId
    );
  }, [allocations, activeRoom, selectedSessionId]);

  const allocationByCoord = useMemo(() => {
    const map = new Map<string, SeatAllocationItem>();
    for (const alloc of roomAllocations) {
      map.set(makeSeatCoordKey(alloc.seatRow, alloc.seatCol), alloc);
    }
    return map;
  }, [roomAllocations]);

  const conflictReport = useMemo(
    () => analyzeRoomConflicts(roomAllocations),
    [roomAllocations]
  );

  if (!activeRoom) {
    return (
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-10 text-center space-y-2">
        <h2 className="font-display text-lg font-semibold text-slate-100">
          No Exam Rooms Configured
        </h2>
        <p className="text-sm text-slate-400">
          Add an exam center and room from Live Centers &amp; Rooms to inspect and edit its seating matrix.
        </p>
      </div>
    );
  }

  const center = centerMap.get(activeRoom.centerId);
  const blockedSet = new Set(activeRoom.blockedSeats ?? []);
  const totalCapacity = activeRoom.rows * activeRoom.cols;
  const usableCapacity = Math.max(0, totalCapacity - blockedSet.size);
  const occupiedCount = roomAllocations.length;
  const freeSeats = Math.max(0, usableCapacity - occupiedCount);
  const checkedInCount = roomAllocations.filter((a) => a.checkedIn).length;

  const selectedAlloc = selectedSeat
    ? allocationByCoord.get(makeSeatCoordKey(selectedSeat.row, selectedSeat.col)) ?? null
    : null;
  const selectedIsBlocked = selectedSeat
    ? blockedSet.has(makeSeatCoordKey(selectedSeat.row, selectedSeat.col))
    : false;

  const handleSeatClick = async (row: number, col: number) => {
    const coord = makeSeatCoordKey(row, col);
    const existingAlloc = allocationByCoord.get(coord);
    const isBlocked = blockedSet.has(coord);

    if (mode === 'block') {
      setBusyKey(coord);
      try {
        await api.toggleBlockedSeat(activeRoom.id, row, col);
        await onRefresh();
        onNotify(
          isBlocked
            ? `Unblocked seat ${formatSeatLabel(row, col)} in ${activeRoom.roomNumber}`
            : `Blocked seat ${formatSeatLabel(row, col)} for maintenance`,
          'info'
        );
      } catch (err: any) {
        onNotify(err.message || 'Failed to toggle seat block', 'error');
      } finally {
        setBusyKey(null);
      }
      return;
    }

    if (mode === 'checkin') {
      if (!existingAlloc) {
        setSelectedSeat({ row, col });
        return;
      }
      setBusyKey(coord);
      try {
        await api.toggleCheckIn(existingAlloc.id, !existingAlloc.checkedIn);
        await onRefresh();
        onNotify(
          `${existingAlloc.student?.rollNumber ?? 'Student'} marked ${
            !existingAlloc.checkedIn ? 'checked in' : 'pending check-in'
          }`,
          'success'
        );
      } catch (err: any) {
        onNotify(err.message || 'Failed to update check-in', 'error');
      } finally {
        setBusyKey(null);
      }
      return;
    }

    // Mode === 'swap'
    if (isBlocked) {
      setSelectedSeat({ row, col });
      return;
    }

    if (!selectedSeat) {
      setSelectedSeat({ row, col });
      return;
    }

    if (selectedSeat.row === row && selectedSeat.col === col) {
      setSelectedSeat(null);
      return;
    }

    const fromCoord = makeSeatCoordKey(selectedSeat.row, selectedSeat.col);
    const fromAlloc = allocationByCoord.get(fromCoord);

    if (!fromAlloc) {
      // Clicked empty seat first, now switching selection to newly clicked seat
      setSelectedSeat({ row, col });
      return;
    }

    setBusyKey(coord);
    try {
      await api.swapSeats({
        examSessionId: selectedSessionId,
        roomId: activeRoom.id,
        fromRow: selectedSeat.row,
        fromCol: selectedSeat.col,
        toRow: row,
        toCol: col,
      });
      await onRefresh();
      onNotify(
        existingAlloc
          ? `Swapped ${formatSeatLabel(selectedSeat.row, selectedSeat.col)} ↔ ${formatSeatLabel(row, col)}`
          : `Moved student to ${formatSeatLabel(row, col)}`,
        'success'
      );
      setSelectedSeat(null);
    } catch (err: any) {
      onNotify(err.message || 'Failed to swap seats', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const handleUnassignSelected = async () => {
    if (!selectedAlloc) return;
    setBusyKey(makeSeatCoordKey(selectedAlloc.seatRow, selectedAlloc.seatCol));
    try {
      await api.unassignSeat(selectedAlloc.id);
      await onRefresh();
      setSelectedSeat(null);
      onNotify('Unassigned student from seat.', 'info');
    } catch (err: any) {
      onNotify(err.message || 'Failed to unassign seat', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Room Selector & Controls Bar */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Active Exam Hall</label>
            <select
              value={activeRoom.id}
              onChange={(e) => {
                setSelectedSeat(null);
                onSelectRoom(Number(e.target.value));
              }}
              className="bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {rooms.map((r) => {
                const c = centerMap.get(r.centerId);
                return (
                  <option key={r.id} value={r.id}>
                    {c?.code ?? 'CTR'} · {r.roomNumber} ({r.rows}×{r.cols})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="h-9 w-px bg-slate-800 hidden sm:block" />

          <div className="space-y-0.5">
            <div className="text-sm font-medium text-slate-100">
              {center?.name ?? 'Exam Center'} · {activeRoom.roomNumber}
            </div>
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              {activeRoom.floorWing} · {occupiedCount}/{usableCapacity} Seated · {freeSeats} Free · {checkedInCount} Checked In
            </div>
          </div>
        </div>

        {/* Interaction Mode Segmented Switch */}
        <div className="flex items-center gap-1 p-1 bg-[#090D16] border border-slate-800 rounded-lg self-start lg:self-auto">
          <button
            onClick={() => {
              setMode('swap');
              setSelectedSeat(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'swap'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Inspect &amp; Swap</span>
          </button>
          <button
            onClick={() => {
              setMode('checkin');
              setSelectedSeat(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'checkin'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Check-In</span>
          </button>
          <button
            onClick={() => {
              setMode('block');
              setSelectedSeat(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'block'
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Block Seats</span>
          </button>
        </div>
      </div>

      {/* Main Split: Interactive Matrix + Seat Inspector / Conflict Audit */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              {mode === 'swap' &&
                'Click an occupied seat, then click any target seat to swap or relocate.'}
              {mode === 'checkin' &&
                'Click any occupied seat to toggle examinee attendance check-in.'}
              {mode === 'block' &&
                'Click any seat coordinate to mark or clear maintenance unavailability.'}
            </div>
            <div className="flex items-center gap-4 text-xs">
              {conflictReport.orthogonalCount === 0 &&
              conflictReport.diagonalCount === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  <span>0 Adjacency Conflicts</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium font-mono tabular-nums">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    {conflictReport.orthogonalCount} Ortho · {conflictReport.diagonalCount} Diag Conflicts
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Front of Hall Marker */}
          <div className="w-full py-2 px-4 rounded-lg bg-[#090D16] border border-slate-800 text-center text-xs font-mono tracking-wider text-slate-400">
            INVIGILATOR DESK · FRONT ENTRANCE ({activeSession?.title ?? 'Exam Session'})
          </div>

          {/* Seat Grid */}
          <div
            className="grid gap-2.5 min-w-[540px]"
            style={{
              gridTemplateColumns: `repeat(${activeRoom.cols}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: activeRoom.rows }).map((_, rIdx) =>
              Array.from({ length: activeRoom.cols }).map((__, cIdx) => {
                const row = rIdx + 1;
                const col = cIdx + 1;
                const coord = makeSeatCoordKey(row, col);
                const alloc = allocationByCoord.get(coord);
                const isBlocked = blockedSet.has(coord);
                const isSelected =
                  selectedSeat?.row === row && selectedSeat?.col === col;
                const hasConflict = conflictReport.conflictedSeatKeys.has(coord);
                const isBusy = busyKey === coord;

                const courseClass = alloc?.student
                  ? getCourseStyle(alloc.student.courseCode)
                  : '';

                return (
                  <button
                    key={coord}
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleSeatClick(row, col)}
                    className={`relative text-left p-2.5 rounded-lg border transition-all duration-150 min-h-[76px] flex flex-col justify-between cursor-pointer ${
                      isBlocked
                        ? 'bg-[#090D16] border-slate-800/80 text-slate-600 opacity-75 hover:border-amber-600/60'
                        : alloc?.student
                        ? `${courseClass} hover:brightness-110`
                        : 'bg-[#0B111E] border-slate-800 text-slate-500 hover:border-slate-600'
                    } ${
                      isSelected
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#111827]'
                        : hasConflict
                        ? 'ring-1 ring-red-500'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span className="text-[11px] font-mono tabular-nums opacity-75">
                        {formatSeatLabel(row, col)}
                      </span>
                      {alloc?.checkedIn && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      {isBlocked && <Ban className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                    </div>

                    {isBlocked ? (
                      <div className="text-[11px] font-medium text-slate-500">
                        Blocked
                      </div>
                    ) : alloc?.student ? (
                      <div className="space-y-0.5">
                        <div className="text-xs font-mono font-semibold tabular-nums truncate">
                          {alloc.student.rollNumber}
                        </div>
                        <div className="text-[11px] opacity-80 truncate">
                          {alloc.student.courseCode} · {alloc.student.department}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-600">Available</div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side Inspector & Conflict Audit */}
        <div className="xl:col-span-4 space-y-5">
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Seat Inspector
            </h3>

            {!selectedSeat ? (
              <p className="text-xs text-slate-400 leading-relaxed">
                Select any coordinate in the hall grid to view assigned examinee details, swap positions, or manage check-in state.
              </p>
            ) : selectedIsBlocked ? (
              <div className="space-y-3">
                <div className="text-xs font-mono text-amber-400">
                  {formatSeatLabel(selectedSeat.row, selectedSeat.col)} · Maintenance Blocked
                </div>
                <p className="text-xs text-slate-400">
                  This seat is excluded from automated allocation. Switch to Block Seats mode to reopen it.
                </p>
              </div>
            ) : selectedAlloc?.student ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-mono text-blue-400 tabular-nums">
                    Seat {formatSeatLabel(selectedSeat.row, selectedSeat.col)}
                  </div>
                  <div className="text-base font-semibold text-slate-50">
                    {selectedAlloc.student.fullName}
                  </div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums">
                    {selectedAlloc.student.rollNumber} · {selectedAlloc.student.department} · {selectedAlloc.student.courseCode}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await api.toggleCheckIn(
                          selectedAlloc.id,
                          !selectedAlloc.checkedIn
                        );
                        await onRefresh();
                        onNotify('Attendance status updated.', 'success');
                      } catch (err: any) {
                        onNotify(err.message, 'error');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {selectedAlloc.checkedIn ? 'Mark Pending' : 'Mark Checked In'}
                    </span>
                  </button>

                  <button
                    onClick={handleUnassignSelected}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 border border-red-800/50 text-xs font-medium text-red-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    <span>Unassign</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-xs font-mono text-emerald-400">
                  {formatSeatLabel(selectedSeat.row, selectedSeat.col)} · Available Seat
                </div>
                <p className="text-xs text-slate-400">
                  Select an occupied seat first to relocate an examinee into this empty seat.
                </p>
              </div>
            )}
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Anti-Malpractice Audit
            </h3>

            {conflictReport.pairs.length === 0 ? (
              <div className="text-xs text-emerald-400/90 leading-relaxed">
                Verified: No orthogonally or diagonally adjacent students in{' '}
                <span className="font-mono">{activeRoom.roomNumber}</span> share the same course code or academic department.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {conflictReport.pairs.map((pair, idx) => (
                  <div
                    key={`${pair.seatA}-${pair.seatB}-${idx}`}
                    className="p-2.5 rounded-lg bg-[#090D16] border border-red-900/50 text-xs space-y-0.5"
                  >
                    <div className="font-mono text-red-300 tabular-nums">
                      {pair.seatA} ({pair.rollA}) ↔ {pair.seatB} ({pair.rollB})
                    </div>
                    <div className="text-slate-400">
                      {pair.type === 'orthogonal' ? 'Orthogonal' : 'Diagonal'} ·{' '}
                      {pair.reason === 'both'
                        ? 'Same Course & Dept'
                        : pair.reason === 'same_course'
                        ? 'Same Course'
                        : 'Same Department'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
