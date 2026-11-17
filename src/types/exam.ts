export interface ExamCenter {
  id: number;
  name: string;
  code: string;
  campusLocation: string;
  createdAt: string;
}

export interface ExamRoom {
  id: number;
  centerId: number;
  roomNumber: string;
  floorWing: string;
  rows: number;
  cols: number;
  blockedSeats: string[];
  isActive: boolean;
  createdAt: string;
}

export interface ExamSession {
  id: number;
  title: string;
  examDate: string;
  timeSlot: string;
  status: string;
  createdAt: string;
}

export interface StudentRecord {
  id: number;
  rollNumber: string;
  fullName: string;
  department: string;
  courseCode: string;
  examSessionId: number;
  createdAt: string;
}

export interface SeatAllocationItem {
  id: number;
  examSessionId: number;
  roomId: number;
  studentId: number;
  seatRow: number;
  seatCol: number;
  checkedIn: boolean;
  allocatedAt: string;
  student?: StudentRecord;
}

export interface WorkspaceSnapshot {
  centers: ExamCenter[];
  rooms: ExamRoom[];
  sessions: ExamSession[];
  students: StudentRecord[];
  allocations: SeatAllocationItem[];
}

export interface ConflictPair {
  seatA: string;
  seatB: string;
  type: 'orthogonal' | 'diagonal';
  reason: 'same_course' | 'same_department' | 'both';
  rollA: string;
  rollB: string;
}

export interface AllocationRunReport {
  sessionId: number;
  totalStudents: number;
  placedCount: number;
  unplacedCount: number;
  orthogonalConflicts: number;
  diagonalConflicts: number;
  roomsUsed: number;
  unplacedRollNumbers: string[];
}

export interface LookupResult {
  student: StudentRecord;
  session: ExamSession;
  allocation: SeatAllocationItem | null;
  room: ExamRoom | null;
  center: ExamCenter | null;
}
