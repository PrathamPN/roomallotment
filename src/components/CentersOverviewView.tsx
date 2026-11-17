import React, { useMemo, useState } from 'react';
import { Building2, Grid3X3, Plus, Power, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type {
  ExamCenter,
  ExamRoom,
  SeatAllocationItem,
} from '../types/exam';

interface CentersOverviewViewProps {
  centers: ExamCenter[];
  rooms: ExamRoom[];
  allocations: SeatAllocationItem[];
  selectedSessionId: number;
  onInspectRoom: (roomId: number) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export function CentersOverviewView({
  centers,
  rooms,
  allocations,
  selectedSessionId,
  onInspectRoom,
  onRefresh,
  onNotify,
}: CentersOverviewViewProps) {
  const [centerFilter, setCenterFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'available' | 'full' | 'inactive'
  >('all');
  const [showAddCenter, setShowAddCenter] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [confirmDeleteRoomId, setConfirmDeleteRoomId] = useState<number | null>(null);

  // Add Center form
  const [centerName, setCenterName] = useState('');
  const [centerCode, setCenterCode] = useState('');
  const [campusLocation, setCampusLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Add Room form
  const [roomCenterId, setRoomCenterId] = useState<string>('');
  const [roomNumber, setRoomNumber] = useState('');
  const [floorWing, setFloorWing] = useState('');
  const [roomRows, setRoomRows] = useState(6);
  const [roomCols, setRoomCols] = useState(6);

  const sessionAllocCountByRoom = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of allocations) {
      if (a.examSessionId === selectedSessionId) {
        map.set(a.roomId, (map.get(a.roomId) ?? 0) + 1);
      }
    }
    return map;
  }, [allocations, selectedSessionId]);

  const centerMap = useMemo(
    () => new Map(centers.map((c) => [c.id, c])),
    [centers]
  );

  const metrics = useMemo(() => {
    let totalUsable = 0;
    let totalOccupied = 0;
    let activeRooms = 0;

    for (const r of rooms) {
      const blocked = r.blockedSeats?.length ?? 0;
      const usable = Math.max(0, r.rows * r.cols - blocked);
      const occupied = sessionAllocCountByRoom.get(r.id) ?? 0;
      if (r.isActive) {
        activeRooms++;
        totalUsable += usable;
        totalOccupied += occupied;
      }
    }

    return {
      totalUsable,
      totalOccupied,
      totalFree: Math.max(0, totalUsable - totalOccupied),
      activeRooms,
      totalCenters: centers.length,
    };
  }, [rooms, centers, sessionAllocCountByRoom]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (centerFilter !== 'all' && String(r.centerId) !== centerFilter) {
        return false;
      }
      const usable = Math.max(0, r.rows * r.cols - (r.blockedSeats?.length ?? 0));
      const occupied = sessionAllocCountByRoom.get(r.id) ?? 0;
      const free = Math.max(0, usable - occupied);

      if (availabilityFilter === 'available') return r.isActive && free > 0;
      if (availabilityFilter === 'full') return r.isActive && free === 0;
      if (availabilityFilter === 'inactive') return !r.isActive;
      return true;
    });
  }, [rooms, centerFilter, availabilityFilter, sessionAllocCountByRoom]);

  const handleCreateCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createCenter({
        name: centerName,
        code: centerCode,
        campusLocation,
      });
      await onRefresh();
      setCenterName('');
      setCenterCode('');
      setCampusLocation('');
      setShowAddCenter(false);
      onNotify('Exam center created.', 'success');
    } catch (err: any) {
      onNotify(err.message || 'Could not create center', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCenter = Number(roomCenterId || centers[0]?.id);
    if (!targetCenter) {
      onNotify('Please create an exam center first.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.createRoom({
        centerId: targetCenter,
        roomNumber,
        floorWing,
        rows: Number(roomRows),
        cols: Number(roomCols),
      });
      await onRefresh();
      setRoomNumber('');
      setFloorWing('');
      setShowAddRoom(false);
      onNotify('Exam room added.', 'success');
    } catch (err: any) {
      onNotify(err.message || 'Could not create room', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Operational KPI Strip — Single-elevation hairline-divided metrics */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400">Live Available Seats</div>
          <div className="text-2xl font-display font-semibold text-emerald-400 font-mono tabular-nums">
            {metrics.totalFree}
          </div>
          <div className="text-xs text-slate-500">Across active halls</div>
        </div>
        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400">Allocated Seats</div>
          <div className="text-2xl font-display font-semibold text-slate-50 font-mono tabular-nums">
            {metrics.totalOccupied}
          </div>
          <div className="text-xs text-slate-500">Current exam slot</div>
        </div>
        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400">Usable Capacity</div>
          <div className="text-2xl font-display font-semibold text-slate-50 font-mono tabular-nums">
            {metrics.totalUsable}
          </div>
          <div className="text-xs text-slate-500">Excluding blocked desks</div>
        </div>
        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400">Exam Centers &amp; Halls</div>
          <div className="text-2xl font-display font-semibold text-slate-50 font-mono tabular-nums">
            {metrics.totalCenters} · {metrics.activeRooms}
          </div>
          <div className="text-xs text-slate-500">Centers · Active rooms</div>
        </div>
      </div>

      {/* Filter & Actions Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={centerFilter}
            onChange={(e) => setCenterFilter(e.target.value)}
            className="bg-[#111827] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Exam Centers ({centers.length})</option>
            {centers.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
            {(['all', 'available', 'full', 'inactive'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setAvailabilityFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 cursor-pointer ${
                  availabilityFilter === tab
                    ? 'bg-slate-800 text-slate-50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setShowAddCenter((v) => !v);
              setShowAddRoom(false);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111827] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>New Center</span>
          </button>
          <button
            onClick={() => {
              if (!roomCenterId && centers[0]) {
                setRoomCenterId(String(centers[0].id));
              }
              setShowAddRoom((v) => !v);
              setShowAddCenter(false);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Exam Room</span>
          </button>
        </div>
      </div>

      {/* Inline Form: New Exam Center */}
      {showAddCenter && (
        <form
          onSubmit={handleCreateCenter}
          className="bg-[#111827] border border-slate-700 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Register New Exam Center
            </h3>
            <button
              type="button"
              onClick={() => setShowAddCenter(false)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Center Name</label>
              <input
                required
                value={centerName}
                onChange={(e) => setCenterName(e.target.value)}
                placeholder="e.g. West Science Wing"
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Short Code</label>
              <input
                required
                maxLength={8}
                value={centerCode}
                onChange={(e) => setCenterCode(e.target.value.toUpperCase())}
                placeholder="e.g. WSW"
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Campus Location</label>
              <input
                required
                value={campusLocation}
                onChange={(e) => setCampusLocation(e.target.value)}
                placeholder="e.g. North Gate · Block C"
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddCenter(false)}
              className="px-4 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Create Center'}
            </button>
          </div>
        </form>
      )}

      {/* Inline Form: New Exam Room */}
      {showAddRoom && (
        <form
          onSubmit={handleCreateRoom}
          className="bg-[#111827] border border-slate-700 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Configure Exam Room Grid
            </h3>
            <button
              type="button"
              onClick={() => setShowAddRoom(false)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Exam Center</label>
              <select
                required
                value={roomCenterId}
                onChange={(e) => setRoomCenterId(e.target.value)}
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {centers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Room Code</label>
              <input
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value.toUpperCase())}
                placeholder="e.g. NB-104"
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Floor / Wing</label>
              <input
                required
                value={floorWing}
                onChange={(e) => setFloorWing(e.target.value)}
                placeholder="e.g. Floor 2 · North"
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Rows (1–15)</label>
              <input
                type="number"
                min={1}
                max={15}
                required
                value={roomRows}
                onChange={(e) => setRoomRows(Number(e.target.value))}
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Columns (1–15)</label>
              <input
                type="number"
                min={1}
                max={15}
                required
                value={roomCols}
                onChange={(e) => setRoomCols(Number(e.target.value))}
                className="w-full bg-[#090D16] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              Total grid capacity: {Math.max(0, roomRows * roomCols)} seats
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddRoom(false)}
                className="px-4 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Create Room'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* High-Density Rooms Availability Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0D1320]">
                <th className="py-3 px-4 font-medium">Room</th>
                <th className="py-3 px-4 font-medium">Exam Center &amp; Floor</th>
                <th className="py-3 px-4 font-medium text-right">Matrix</th>
                <th className="py-3 px-4 font-medium text-right">Blocked</th>
                <th className="py-3 px-4 font-medium text-right">Allocated</th>
                <th className="py-3 px-4 font-medium text-right">Available</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-sm">
              {filteredRooms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
                    No exam rooms match the current filter.
                  </td>
                </tr>
              ) : (
                filteredRooms.map((room) => {
                  const center = centerMap.get(room.centerId);
                  const blocked = room.blockedSeats?.length ?? 0;
                  const usable = Math.max(0, room.rows * room.cols - blocked);
                  const occupied = sessionAllocCountByRoom.get(room.id) ?? 0;
                  const free = Math.max(0, usable - occupied);
                  const occupancyPct = usable > 0 ? Math.round((occupied / usable) * 100) : 0;

                  return (
                    <tr
                      key={room.id}
                      className="hover:bg-slate-800/35 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-slate-100 tabular-nums whitespace-nowrap">
                        {room.roomNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200 font-medium">
                          {center?.name ?? 'Center'}
                        </div>
                        <div className="text-xs text-slate-400">
                          {center?.code} · {room.floorWing}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                        {room.rows}×{room.cols}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                        {blocked}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                        {occupied} / {usable}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                        <span
                          className={
                            !room.isActive
                              ? 'text-slate-500'
                              : free === 0
                              ? 'text-red-400'
                              : free <= 5
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }
                        >
                          {room.isActive ? free : 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {!room.isActive ? (
                          <span className="text-slate-500">Inactive</span>
                        ) : free === 0 ? (
                          <span className="text-red-400 font-medium">
                            Full ({occupancyPct}%)
                          </span>
                        ) : free <= 5 ? (
                          <span className="text-amber-400 font-medium">
                            Near Capacity ({occupancyPct}%)
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-medium">
                            Available ({occupancyPct}%)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => onInspectRoom(room.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 transition-colors cursor-pointer"
                          >
                            <Grid3X3 className="w-3.5 h-3.5 text-blue-400" />
                            <span>Matrix</span>
                          </button>

                          <button
                            onClick={async () => {
                              try {
                                await api.toggleRoomActive(room.id, !room.isActive);
                                await onRefresh();
                                onNotify(
                                  `${room.roomNumber} marked ${
                                    !room.isActive ? 'active' : 'inactive'
                                  }.`,
                                  'info'
                                );
                              } catch (err: any) {
                                onNotify(err.message, 'error');
                              }
                            }}
                            title={room.isActive ? 'Deactivate Room' : 'Activate Room'}
                            className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          {confirmDeleteRoomId === room.id ? (
                            <button
                              onClick={async () => {
                                try {
                                  await api.deleteRoom(room.id);
                                  setConfirmDeleteRoomId(null);
                                  await onRefresh();
                                  onNotify(`Deleted ${room.roomNumber}.`, 'info');
                                } catch (err: any) {
                                  onNotify(err.message, 'error');
                                }
                              }}
                              className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-xs font-medium text-white cursor-pointer"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteRoomId(room.id)}
                              title="Delete Room"
                              className="p-1.5 rounded-md bg-slate-800/80 hover:bg-red-950/80 text-slate-400 hover:text-red-300 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
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
