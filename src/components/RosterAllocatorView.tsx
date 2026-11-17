import React, { useMemo, useState } from 'react';
import {
  Play,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { formatSeatLabel } from '../lib/allocator';
import { api } from '../lib/api';
import type {
  AllocationRunReport,
  ExamCenter,
  ExamRoom,
  ExamSession,
  SeatAllocationItem,
  StudentRecord,
} from '../types/exam';

interface RosterAllocatorViewProps {
  centers: ExamCenter[];
  rooms: ExamRoom[];
  sessions: ExamSession[];
  students: StudentRecord[];
  allocations: SeatAllocationItem[];
  selectedSessionId: number;
  onSelectSession: (sessionId: number) => void;
  onInspectRoom: (roomId: number) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export function RosterAllocatorView({
  centers,
  rooms,
  sessions,
  students,
  allocations,
  selectedSessionId,
  onSelectSession,
  onInspectRoom,
  onRefresh,
  onNotify,
}: RosterAllocatorViewProps) {
  const [strictDiagonal, setStrictDiagonal] = useState(true);
  const [selectedCenterIds, setSelectedCenterIds] = useState<number[]>([]);
  const [runningAllocation, setRunningAllocation] = useState(false);
  const [lastReport, setLastReport] = useState<AllocationRunReport | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Roster filters
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');

  // Add student / bulk paste / new session modals
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);

  const [rollNumber, setRollNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('CSE');
  const [courseCode, setCourseCode] = useState('CS-301');

  const [csvText, setCsvText] = useState(
    '24CS190, Anirudh Rao, CSE, CS-301\n24EC190, Bhavna Iyer, ECE, EC-204\n24ME190, Chirag Joshi, MECH, ME-210'
  );

  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDate, setNewSessionDate] = useState('2026-11-24');
  const [newSessionTime, setNewSessionTime] = useState('09:30 AM – 12:30 PM');

  const sessionStudents = useMemo(
    () => students.filter((s) => s.examSessionId === selectedSessionId),
    [students, selectedSessionId]
  );

  const allocationByStudentId = useMemo(() => {
    const map = new Map<number, SeatAllocationItem>();
    for (const a of allocations) {
      if (a.examSessionId === selectedSessionId) {
        map.set(a.studentId, a);
      }
    }
    return map;
  }, [allocations, selectedSessionId]);

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const centerMap = useMemo(() => new Map(centers.map((c) => [c.id, c])), [centers]);

  const departments = useMemo(
    () => Array.from(new Set(sessionStudents.map((s) => s.department))).sort(),
    [sessionStudents]
  );

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sessionStudents.filter((s) => {
      if (deptFilter !== 'all' && s.department !== deptFilter) return false;
      const alloc = allocationByStudentId.get(s.id);
      if (statusFilter === 'assigned' && !alloc) return false;
      if (statusFilter === 'unassigned' && alloc) return false;
      if (!q) return true;
      return (
        s.rollNumber.toLowerCase().includes(q) ||
        s.fullName.toLowerCase().includes(q) ||
        s.courseCode.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
      );
    });
  }, [sessionStudents, deptFilter, statusFilter, searchQuery, allocationByStudentId]);

  const parsedCsvRows = useMemo(() => {
    return csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,\t]+/).map((p) => p.trim());
        return {
          rollNumber: parts[0] ?? '',
          fullName: parts[1] ?? '',
          department: parts[2] ?? '',
          courseCode: parts[3] ?? '',
          valid: Boolean(parts[0] && parts[1] && parts[2] && parts[3]),
        };
      });
  }, [csvText]);

  const handleRunAutoAllocation = async () => {
    setRunningAllocation(true);
    try {
      const targetRoomIds =
        selectedCenterIds.length > 0
          ? rooms
              .filter((r) => r.isActive && selectedCenterIds.includes(r.centerId))
              .map((r) => r.id)
          : undefined;

      const report = await api.runAllocation({
        examSessionId: selectedSessionId,
        roomIds: targetRoomIds,
        strictDiagonal,
      });
      setLastReport(report);
      await onRefresh();
      onNotify(
        `Allocated ${report.placedCount}/${report.totalStudents} students with ${report.orthogonalConflicts} orthogonal conflicts.`,
        'success'
      );
    } catch (err: any) {
      onNotify(err.message || 'Auto-allocation failed', 'error');
    } finally {
      setRunningAllocation(false);
    }
  };

  const handleClearAllocations = async () => {
    try {
      await api.clearAllocations(selectedSessionId);
      setLastReport(null);
      setConfirmClear(false);
      await onRefresh();
      onNotify('Cleared seating allocations for this session.', 'info');
    } catch (err: any) {
      onNotify(err.message || 'Failed to clear allocations', 'error');
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.bulkCreateStudents([
        {
          rollNumber,
          fullName,
          department,
          courseCode,
          examSessionId: selectedSessionId,
        },
      ]);
      if (res.inserted.length === 0) {
        onNotify('Roll number already exists in roster.', 'error');
        return;
      }
      setRollNumber('');
      setFullName('');
      setShowAddStudent(false);
      await onRefresh();
      onNotify('Student added to exam roster.', 'success');
    } catch (err: any) {
      onNotify(err.message || 'Failed to add student', 'error');
    }
  };

  const handleBulkImport = async () => {
    const valid = parsedCsvRows.filter((r) => r.valid);
    if (valid.length === 0) {
      onNotify('No valid CSV rows to import.', 'error');
      return;
    }
    try {
      const res = await api.bulkCreateStudents(
        valid.map((v) => ({
          rollNumber: v.rollNumber,
          fullName: v.fullName,
          department: v.department,
          courseCode: v.courseCode,
          examSessionId: selectedSessionId,
        }))
      );
      setShowBulkPaste(false);
      await onRefresh();
      onNotify(`Imported ${res.inserted.length} new student records.`, 'success');
    } catch (err: any) {
      onNotify(err.message || 'Bulk import failed', 'error');
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createSession({
        title: newSessionTitle,
        examDate: newSessionDate,
        timeSlot: newSessionTime,
      });
      setNewSessionTitle('');
      setShowNewSession(false);
      await onRefresh();
      onSelectSession(created.id);
      onNotify('Created new exam session.', 'success');
    } catch (err: any) {
      onNotify(err.message || 'Failed to create session', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Automated Seating Engine Panel */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-slate-50">
              Interleaved Anti-Malpractice Seating Engine
            </h2>
            <p className="text-xs text-slate-400">
              Automatically separates students sharing the same course code or department across adjacent seats in active halls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowNewSession((v) => !v)}
              className="px-3 py-2 rounded-lg bg-[#090D16] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap cursor-pointer"
            >
              New Session
            </button>

            {confirmClear ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleClearAllocations}
                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium text-white whitespace-nowrap cursor-pointer"
                >
                  Confirm Clear
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-2.5 py-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="px-3 py-2 rounded-lg bg-[#090D16] hover:bg-red-950/60 border border-slate-700 text-xs font-medium text-slate-300 hover:text-red-200 whitespace-nowrap cursor-pointer"
              >
                Clear Plan
              </button>
            )}

            <button
              onClick={handleRunAutoAllocation}
              disabled={runningAllocation || sessionStudents.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {runningAllocation ? 'Allocating...' : 'Run Auto-Allocation'}
              </span>
            </button>
          </div>
        </div>

        {/* Options Row */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">Target Centers:</span>
            <button
              onClick={() => setSelectedCenterIds([])}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                selectedCenterIds.length === 0
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                  : 'bg-[#090D16] text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              All Active Centers
            </button>
            {centers.map((c) => {
              const active = selectedCenterIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() =>
                    setSelectedCenterIds((prev) =>
                      prev.includes(c.id)
                        ? prev.filter((id) => id !== c.id)
                        : [...prev, c.id]
                    )
                  }
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                      : 'bg-[#090D16] text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {c.code}
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={strictDiagonal}
              onChange={(e) => setStrictDiagonal(e.target.checked)}
              className="rounded border-slate-700 bg-[#090D16] text-blue-600 focus:ring-0"
            />
            <span>Enforce 8-neighbor diagonal separation</span>
          </label>
        </div>

        {/* Verification Report Banner */}
        {lastReport && (
          <div className="p-4 rounded-lg bg-[#090D16] border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                Allocation Complete · {lastReport.placedCount} / {lastReport.totalStudents} Students Seated across {lastReport.roomsUsed} Halls
              </span>
            </div>
            <div className="font-mono tabular-nums text-slate-300">
              {lastReport.orthogonalConflicts} Orthogonal Conflicts ·{' '}
              {lastReport.diagonalConflicts} Diagonal Conflicts
              {lastReport.unplacedCount > 0 && (
                <span className="text-red-400 ml-2">
                  · {lastReport.unplacedCount} Overflow
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inline Form: New Exam Session */}
      {showNewSession && (
        <form
          onSubmit={handleCreateSession}
          className="bg-[#111827] border border-slate-700 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Create Exam Session Slot
            </h3>
            <button
              type="button"
              onClick={() => setShowNewSession(false)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Session Title</label>
              <input
                required
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                placeholder="e.g. Finals — Morning Slot C"
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Exam Date</label>
              <input
                type="date"
                required
                value={newSessionDate}
                onChange={(e) => setNewSessionDate(e.target.value)}
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Time Slot</label>
              <input
                required
                value={newSessionTime}
                onChange={(e) => setNewSessionTime(e.target.value)}
                placeholder="09:30 AM – 12:30 PM"
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewSession(false)}
              className="px-4 py-2 text-xs text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white cursor-pointer"
            >
              Save Session
            </button>
          </div>
        </form>
      )}

      {/* Roster Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter roll no, name, or course..."
              className="bg-[#111827] border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 w-64 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="bg-[#111827] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
            {(['all', 'assigned', 'unassigned'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st
                    ? 'bg-slate-800 text-slate-50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setShowBulkPaste((v) => !v);
              setShowAddStudent(false);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111827] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Bulk CSV Import</span>
          </button>
          <button
            onClick={() => {
              setShowAddStudent((v) => !v);
              setShowBulkPaste(false);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Add Single Student Form */}
      {showAddStudent && (
        <form
          onSubmit={handleAddStudent}
          className="bg-[#111827] border border-slate-700 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-xs text-slate-400 mb-1">Roll Number</label>
            <input
              required
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
              placeholder="24CS145"
              className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Full Name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Neha Kulkarni"
              className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Department</label>
            <input
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value.toUpperCase())}
              placeholder="CSE"
              className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Course Code</label>
            <input
              required
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
              placeholder="CS-301"
              className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white cursor-pointer"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAddStudent(false)}
              className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Bulk CSV Import Panel */}
      {showBulkPaste && (
        <div className="bg-[#111827] border border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Bulk Paste Student Roster (CSV)
              </h3>
              <p className="text-xs text-slate-400">
                Format per line: Roll Number, Full Name, Department, Course Code
              </p>
            </div>
            <button
              onClick={() => setShowBulkPaste(false)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            rows={5}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full bg-[#090D16] border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {parsedCsvRows.filter((r) => r.valid).length} valid rows detected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkPaste(false)}
                className="px-4 py-2 text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkImport}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white cursor-pointer"
              >
                Import Roster
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roster Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0D1320]">
                <th className="py-3 px-4 font-medium">Roll Number</th>
                <th className="py-3 px-4 font-medium">Examinee Name</th>
                <th className="py-3 px-4 font-medium">Department</th>
                <th className="py-3 px-4 font-medium">Course Code</th>
                <th className="py-3 px-4 font-medium">Seat Assignment</th>
                <th className="py-3 px-4 font-medium">Check-In</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-sm">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                    No examinees found for this filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const alloc = allocationByStudentId.get(student.id);
                  const room = alloc ? roomMap.get(alloc.roomId) : null;
                  const center = room ? centerMap.get(room.centerId) : null;

                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-slate-800/35 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-slate-100 whitespace-nowrap">
                        {student.rollNumber}
                      </td>
                      <td className="py-2.5 px-4 text-slate-200">
                        {student.fullName}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-300">
                        {student.department}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-300">
                        {student.courseCode}
                      </td>
                      <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                        {alloc && room ? (
                          <button
                            onClick={() => onInspectRoom(room.id)}
                            className="font-mono tabular-nums text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline cursor-pointer"
                          >
                            {center?.code} · {room.roomNumber} ·{' '}
                            {formatSeatLabel(alloc.seatRow, alloc.seatCol)}
                          </button>
                        ) : (
                          <span className="text-amber-400">Unassigned</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                        {!alloc ? (
                          <span className="text-slate-500">—</span>
                        ) : alloc.checkedIn ? (
                          <span className="text-emerald-400 font-medium">Checked In</span>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={async () => {
                            try {
                              await api.deleteStudent(student.id);
                              await onRefresh();
                              onNotify(`Removed ${student.rollNumber}.`, 'info');
                            } catch (err: any) {
                              onNotify(err.message, 'error');
                            }
                          }}
                          title="Remove Student"
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-300 hover:bg-red-950/60 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
