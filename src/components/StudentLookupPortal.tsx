import React, { useEffect, useState } from 'react';
import { Building2, Calendar, Clock, MapPin, Search } from 'lucide-react';
import { formatSeatLabel, makeSeatCoordKey } from '../lib/allocator';
import { api } from '../lib/api';
import type { LookupResult, StudentRecord } from '../types/exam';

interface StudentLookupPortalProps {
  sampleStudents: StudentRecord[];
}

export function StudentLookupPortal({ sampleStudents }: StudentLookupPortalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setResults([]);
      setSearchedOnce(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.lookupStudents(trimmed);
      setResults(res.results);
      setSearchedOnce(true);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sampleStudents.length > 0 && !searchedOnce && !query) {
      const firstRoll = sampleStudents[0].rollNumber;
      setQuery(firstRoll);
      runSearch(firstRoll);
    }
  }, [sampleStudents]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const quickSamples = sampleStudents.slice(0, 5);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Search Header Card */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-slate-50">
            Student Exam Hall &amp; Seat Lookup
          </h2>
          <p className="text-sm text-slate-400">
            Enter your university roll number, full name, or course code to verify your assigned exam center, hall, and exact seat position.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roll number (e.g. 24CS101) or student name..."
              className="w-full bg-[#090D16] border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Find Seat'}
          </button>
        </form>

        {quickSamples.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Quick lookup:</span>
            {quickSamples.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setQuery(s.rollNumber);
                  runSearch(s.rollNumber);
                }}
                className="font-mono px-2 py-1 rounded-md bg-[#090D16] hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
              >
                {s.rollNumber}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-800/60 text-sm text-red-200">
          {error}
        </div>
      )}

      {searchedOnce && results.length === 0 && !loading && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-10 text-center space-y-1">
          <div className="text-sm font-medium text-slate-200">
            No matching student records found
          </div>
          <div className="text-xs text-slate-400">
            Verify the roll number or full name and try again.
          </div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-6">
        {results.map((item) => {
          const { student, session, allocation, room, center } = item;
          const blockedSet = new Set(room?.blockedSeats ?? []);

          return (
            <div
              key={`${student.id}-${session.id}`}
              className="bg-[#111827] border border-slate-800 rounded-xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
            >
              {/* Left: Digital Hall Ticket Details */}
              <div className="lg:col-span-5 space-y-5">
                <div className="space-y-1">
                  <div className="text-xs font-mono text-blue-400 tabular-nums">
                    {student.rollNumber} · {student.department} · {student.courseCode}
                  </div>
                  <h3 className="font-display text-xl font-semibold text-slate-50">
                    {student.fullName}
                  </h3>
                  <div className="text-xs text-slate-400">{session.title}</div>
                </div>

                {allocation && room && center ? (
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="p-4 rounded-lg bg-[#090D16] border border-blue-500/40 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-400">Assigned Seat</div>
                        <div className="text-2xl font-display font-semibold font-mono tabular-nums text-blue-400">
                          {formatSeatLabel(allocation.seatRow, allocation.seatCol)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Exam Hall</div>
                        <div className="text-lg font-mono font-semibold text-slate-100">
                          {room.roomNumber}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-300">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {center.name} ({center.code}) · {room.floorWing}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{center.campusLocation}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{session.examDate}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{session.timeSlot}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-amber-950/30 border border-amber-800/50 text-xs text-amber-200">
                    Seat allocation is pending for this exam session. Please check back once the exam controller publishes the seating plan.
                  </div>
                )}
              </div>

              {/* Right: Visual Hall Seat Locator */}
              <div className="lg:col-span-7">
                {allocation && room ? (
                  <div className="bg-[#090D16] border border-slate-800 rounded-xl p-4 space-y-3 overflow-x-auto">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Hall Layout Locator ({room.roomNumber})</span>
                      <span className="font-mono tabular-nums">
                        Row {allocation.seatRow} · Column {allocation.seatCol}
                      </span>
                    </div>

                    <div className="py-1.5 rounded bg-[#111827] border border-slate-800 text-center text-[11px] font-mono text-slate-400">
                      INVIGILATOR DESK · FRONT ENTRANCE
                    </div>

                    <div
                      className="grid gap-1.5 min-w-[360px]"
                      style={{
                        gridTemplateColumns: `repeat(${room.cols}, minmax(0, 1fr))`,
                      }}
                    >
                      {Array.from({ length: room.rows }).map((_, rIdx) =>
                        Array.from({ length: room.cols }).map((__, cIdx) => {
                          const r = rIdx + 1;
                          const c = cIdx + 1;
                          const isTarget =
                            r === allocation.seatRow && c === allocation.seatCol;
                          const isBlocked = blockedSet.has(makeSeatCoordKey(r, c));

                          return (
                            <div
                              key={`${r}-${c}`}
                              className={`h-9 rounded flex items-center justify-center text-[10px] font-mono tabular-nums border ${
                                isTarget
                                  ? 'bg-blue-600 border-blue-400 text-white font-semibold'
                                  : isBlocked
                                  ? 'bg-slate-950 border-slate-900 text-slate-700'
                                  : 'bg-[#111827] border-slate-800/90 text-slate-500'
                              }`}
                            >
                              {isTarget ? 'YOU' : formatSeatLabel(r, c)}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full min-h-[200px] bg-[#090D16] border border-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-500 p-6">
                    Room locator map will appear once seat is assigned.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
