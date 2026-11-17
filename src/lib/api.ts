import { auth } from './firebase';
import type {
  AllocationRunReport,
  ExamCenter,
  ExamRoom,
  ExamSession,
  LookupResult,
  StudentRecord,
  WorkspaceSnapshot,
} from '../types/exam';

async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required. Please sign in.');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getWorkspace: () => apiRequest<WorkspaceSnapshot>('/api/workspace'),

  createCenter: (payload: { name: string; code: string; campusLocation: string }) =>
    apiRequest<ExamCenter>('/api/centers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteCenter: (centerId: number) =>
    apiRequest<{ ok: boolean }>(`/api/centers/${centerId}`, {
      method: 'DELETE',
    }),

  createRoom: (payload: {
    centerId: number;
    roomNumber: string;
    floorWing: string;
    rows: number;
    cols: number;
  }) =>
    apiRequest<ExamRoom>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleRoomActive: (roomId: number, isActive: boolean) =>
    apiRequest<ExamRoom>(`/api/rooms/${roomId}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),

  toggleBlockedSeat: (roomId: number, row: number, col: number) =>
    apiRequest<ExamRoom>(`/api/rooms/${roomId}/toggle-block`, {
      method: 'POST',
      body: JSON.stringify({ row, col }),
    }),

  deleteRoom: (roomId: number) =>
    apiRequest<{ ok: boolean }>(`/api/rooms/${roomId}`, {
      method: 'DELETE',
    }),

  createSession: (payload: { title: string; examDate: string; timeSlot: string }) =>
    apiRequest<ExamSession>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  bulkCreateStudents: (
    items: Array<{
      rollNumber: string;
      fullName: string;
      department: string;
      courseCode: string;
      examSessionId: number;
    }>
  ) =>
    apiRequest<{ inserted: StudentRecord[] }>('/api/students/bulk', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  deleteStudent: (studentId: number) =>
    apiRequest<{ ok: boolean }>(`/api/students/${studentId}`, {
      method: 'DELETE',
    }),

  runAllocation: (payload: {
    examSessionId: number;
    roomIds?: number[];
    strictDiagonal?: boolean;
  }) =>
    apiRequest<AllocationRunReport>('/api/allocations/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  clearAllocations: (sessionId: number) =>
    apiRequest<{ ok: boolean }>(`/api/allocations/session/${sessionId}`, {
      method: 'DELETE',
    }),

  swapSeats: (payload: {
    examSessionId: number;
    roomId: number;
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
  }) =>
    apiRequest<{ ok: boolean }>('/api/allocations/swap', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleCheckIn: (allocationId: number, checkedIn: boolean) =>
    apiRequest<{ ok: boolean }>(`/api/allocations/${allocationId}/checkin`, {
      method: 'PATCH',
      body: JSON.stringify({ checkedIn }),
    }),

  unassignSeat: (allocationId: number) =>
    apiRequest<{ ok: boolean }>(`/api/allocations/${allocationId}`, {
      method: 'DELETE',
    }),

  lookupStudents: (query: string) =>
    apiRequest<{ results: LookupResult[] }>(
      `/api/lookup?q=${encodeURIComponent(query)}`
    ),
};
