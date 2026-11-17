import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './index.ts';
import {
  examCenters,
  examSessions,
  rooms,
  seatAllocations,
  students,
} from './schema.ts';
import { makeSeatCoordKey, runInterleavedAllocation } from '../lib/allocator.ts';
import type {
  AllocationRunReport,
  ExamCenter,
  ExamRoom,
  ExamSession,
  LookupResult,
  SeatAllocationItem,
  StudentRecord,
  WorkspaceSnapshot,
} from '../types/exam.ts';

function toCenterDto(row: typeof examCenters.$inferSelect): ExamCenter {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    campusLocation: row.campusLocation,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRoomDto(row: typeof rooms.$inferSelect): ExamRoom {
  return {
    id: row.id,
    centerId: row.centerId,
    roomNumber: row.roomNumber,
    floorWing: row.floorWing,
    rows: row.rows,
    cols: row.cols,
    blockedSeats: Array.isArray(row.blockedSeats) ? row.blockedSeats : [],
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSessionDto(row: typeof examSessions.$inferSelect): ExamSession {
  return {
    id: row.id,
    title: row.title,
    examDate: row.examDate,
    timeSlot: row.timeSlot,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toStudentDto(row: typeof students.$inferSelect): StudentRecord {
  return {
    id: row.id,
    rollNumber: row.rollNumber,
    fullName: row.fullName,
    department: row.department,
    courseCode: row.courseCode,
    examSessionId: row.examSessionId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  try {
    const [centerRows, roomRows, sessionRows, studentRows, allocRows] =
      await Promise.all([
        db.select().from(examCenters).orderBy(asc(examCenters.id)),
        db.select().from(rooms).orderBy(asc(rooms.centerId), asc(rooms.roomNumber)),
        db.select().from(examSessions).orderBy(asc(examSessions.id)),
        db.select().from(students).orderBy(asc(students.rollNumber)),
        db.select().from(seatAllocations).orderBy(asc(seatAllocations.id)),
      ]);

    const studentMap = new Map<number, StudentRecord>();
    const studentDtos = studentRows.map((row) => {
      const dto = toStudentDto(row);
      studentMap.set(dto.id, dto);
      return dto;
    });

    const allocationDtos: SeatAllocationItem[] = allocRows.map((row) => ({
      id: row.id,
      examSessionId: row.examSessionId,
      roomId: row.roomId,
      studentId: row.studentId,
      seatRow: row.seatRow,
      seatCol: row.seatCol,
      checkedIn: row.checkedIn,
      allocatedAt: row.allocatedAt.toISOString(),
      student: studentMap.get(row.studentId),
    }));

    return {
      centers: centerRows.map(toCenterDto),
      rooms: roomRows.map(toRoomDto),
      sessions: sessionRows.map(toSessionDto),
      students: studentDtos,
      allocations: allocationDtos,
    };
  } catch (error) {
    console.error('Failed to load workspace snapshot:', error);
    throw new Error('Failed to load exam workspace data.', { cause: error });
  }
}

export async function seedInitialWorkspace(): Promise<{ seeded: boolean }> {
  try {
    const existingCenters = await db.select().from(examCenters);
    if (existingCenters.length > 0) {
      return { seeded: false };
    }

    const insertedCenters = await db
      .insert(examCenters)
      .values([
        {
          name: 'North Academic Block',
          code: 'NAB',
          campusLocation: 'Main Campus · Gate 1',
        },
        {
          name: 'Engineering Annex',
          code: 'ENG',
          campusLocation: 'East Quadrant · Tech Wing',
        },
        {
          name: 'Central Science Pavilion',
          code: 'CSP',
          campusLocation: 'Research Plaza · South',
        },
      ])
      .returning();

    const [nab, eng, csp] = insertedCenters;

    const insertedRooms = await db
      .insert(rooms)
      .values([
        {
          centerId: nab.id,
          roomNumber: 'NB-101',
          floorWing: 'Floor 1 · East Wing',
          rows: 6,
          cols: 6,
          blockedSeats: ['1-6', '6-1'],
          isActive: true,
        },
        {
          centerId: nab.id,
          roomNumber: 'NB-102',
          floorWing: 'Floor 1 · West Wing',
          rows: 5,
          cols: 6,
          blockedSeats: ['3-3'],
          isActive: true,
        },
        {
          centerId: eng.id,
          roomNumber: 'EA-201',
          floorWing: 'Floor 2 · Robotics Hall',
          rows: 6,
          cols: 6,
          blockedSeats: [],
          isActive: true,
        },
        {
          centerId: eng.id,
          roomNumber: 'EA-202',
          floorWing: 'Floor 2 · CAD Lab',
          rows: 5,
          cols: 5,
          blockedSeats: ['5-5'],
          isActive: true,
        },
        {
          centerId: csp.id,
          roomNumber: 'CS-301',
          floorWing: 'Floor 3 · Lecture Theater',
          rows: 6,
          cols: 6,
          blockedSeats: ['1-1', '1-6'],
          isActive: true,
        },
        {
          centerId: csp.id,
          roomNumber: 'CS-302',
          floorWing: 'Floor 3 · Seminar Hall',
          rows: 4,
          cols: 6,
          blockedSeats: [],
          isActive: true,
        },
      ])
      .returning();

    const insertedSessions = await db
      .insert(examSessions)
      .values([
        {
          title: 'Autumn Midterm — Core Engineering Slot A',
          examDate: '2026-11-20',
          timeSlot: '09:30 AM – 12:30 PM',
          status: 'active',
        },
        {
          title: 'Autumn Midterm — Applied Sciences Slot B',
          examDate: '2026-11-20',
          timeSlot: '02:00 PM – 05:00 PM',
          status: 'scheduled',
        },
      ])
      .returning();

    const [sessionA, sessionB] = insertedSessions;

    const cohortsA = [
      { dept: 'CSE', course: 'CS-301', prefix: '24CS' },
      { dept: 'ECE', course: 'EC-204', prefix: '24EC' },
      { dept: 'MECH', course: 'ME-210', prefix: '24ME' },
      { dept: 'CIVIL', course: 'CE-202', prefix: '24CE' },
    ];

    const firstNames = [
      'Aarav', 'Diya', 'Rohan', 'Ananya', 'Karthik', 'Meera', 'Vikram', 'Sneha',
      'Siddharth', 'Priya', 'Arjun', 'Kavya', 'Nikhil', 'Ishita', 'Dev', 'Nandini',
      'Pranav', 'Riya', 'Aditya', 'Tanvi',
    ];
    const lastNames = [
      'Sharma', 'Nair', 'Patel', 'Reddy', 'Iyer', 'Verma', 'Kulkarni', 'Menon',
      'Gupta', 'Joshi', 'Rao', 'Deshmukh', 'Bhat', 'Kapoor', 'Sinha', 'Das',
    ];

    const sampleStudentsA: Array<typeof students.$inferInsert> = [];
    let counter = 1;
    for (let i = 0; i < 16; i++) {
      for (const cohort of cohortsA) {
        const fname = firstNames[(counter * 3 + i) % firstNames.length];
        const lname = lastNames[(counter * 5 + i) % lastNames.length];
        sampleStudentsA.push({
          rollNumber: `${cohort.prefix}${String(100 + i + 1).padStart(3, '0')}`,
          fullName: `${fname} ${lname}`,
          department: cohort.dept,
          courseCode: cohort.course,
          examSessionId: sessionA.id,
        });
        counter++;
      }
    }

    const cohortsB = [
      { dept: 'CSE', course: 'CS-402', prefix: '23CS' },
      { dept: 'ECE', course: 'EC-310', prefix: '23EC' },
      { dept: 'BIOTECH', course: 'BT-205', prefix: '23BT' },
    ];

    const sampleStudentsB: Array<typeof students.$inferInsert> = [];
    for (let i = 0; i < 8; i++) {
      for (const cohort of cohortsB) {
        const fname = firstNames[(counter * 7 + i) % firstNames.length];
        const lname = lastNames[(counter * 2 + i) % lastNames.length];
        sampleStudentsB.push({
          rollNumber: `${cohort.prefix}${String(200 + i + 1).padStart(3, '0')}`,
          fullName: `${fname} ${lname}`,
          department: cohort.dept,
          courseCode: cohort.course,
          examSessionId: sessionB.id,
        });
        counter++;
      }
    }

    const insertedStudents = await db
      .insert(students)
      .values([...sampleStudentsA, ...sampleStudentsB])
      .returning();

    const studentsForA = insertedStudents
      .filter((s) => s.examSessionId === sessionA.id)
      .map(toStudentDto);
    const roomDtos = insertedRooms.map(toRoomDto);

    const solverResult = runInterleavedAllocation(roomDtos, studentsForA, {
      strictDiagonal: true,
    });

    if (solverResult.placements.length > 0) {
      await db.insert(seatAllocations).values(
        solverResult.placements.map((p, idx) => ({
          examSessionId: sessionA.id,
          roomId: p.roomId,
          studentId: p.studentId,
          seatRow: p.seatRow,
          seatCol: p.seatCol,
          checkedIn: idx < 18,
        }))
      );
    }

    return { seeded: true };
  } catch (error) {
    console.error('Failed to seed initial workspace:', error);
    throw new Error('Failed to initialize default exam data.', { cause: error });
  }
}

export async function createExamCenter(input: {
  name: string;
  code: string;
  campusLocation: string;
}): Promise<ExamCenter> {
  try {
    const [row] = await db
      .insert(examCenters)
      .values({
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        campusLocation: input.campusLocation.trim(),
      })
      .returning();
    return toCenterDto(row);
  } catch (error) {
    console.error('Failed to create exam center:', error);
    throw new Error('Could not create exam center. Check that the center code is unique.', {
      cause: error,
    });
  }
}

export async function deleteExamCenter(centerId: number): Promise<void> {
  try {
    await db.delete(examCenters).where(eq(examCenters.id, centerId));
  } catch (error) {
    console.error('Failed to delete exam center:', error);
    throw new Error('Failed to remove exam center.', { cause: error });
  }
}

export async function createRoom(input: {
  centerId: number;
  roomNumber: string;
  floorWing: string;
  rows: number;
  cols: number;
  blockedSeats?: string[];
}): Promise<ExamRoom> {
  try {
    const [row] = await db
      .insert(rooms)
      .values({
        centerId: input.centerId,
        roomNumber: input.roomNumber.trim().toUpperCase(),
        floorWing: input.floorWing.trim(),
        rows: input.rows,
        cols: input.cols,
        blockedSeats: input.blockedSeats ?? [],
        isActive: true,
      })
      .returning();
    return toRoomDto(row);
  } catch (error) {
    console.error('Failed to create room:', error);
    throw new Error('Could not create room. Room code may already exist in this center.', {
      cause: error,
    });
  }
}

export async function toggleRoomActive(
  roomId: number,
  isActive: boolean
): Promise<ExamRoom> {
  try {
    const [updated] = await db
      .update(rooms)
      .set({ isActive })
      .where(eq(rooms.id, roomId))
      .returning();
    if (!updated) {
      throw new Error('Room not found.');
    }
    return toRoomDto(updated);
  } catch (error) {
    console.error('Failed to update room status:', error);
    throw new Error('Failed to update room availability status.', { cause: error });
  }
}

export async function toggleRoomBlockedSeat(
  roomId: number,
  row: number,
  col: number
): Promise<ExamRoom> {
  try {
    const [existing] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!existing) {
      throw new Error('Room not found.');
    }
    const coord = makeSeatCoordKey(row, col);
    const currentBlocked = new Set(
      Array.isArray(existing.blockedSeats) ? existing.blockedSeats : []
    );

    if (currentBlocked.has(coord)) {
      currentBlocked.delete(coord);
    } else {
      // Remove any existing allocation at this coordinate when blocking a seat
      await db
        .delete(seatAllocations)
        .where(
          and(
            eq(seatAllocations.roomId, roomId),
            eq(seatAllocations.seatRow, row),
            eq(seatAllocations.seatCol, col)
          )
        );
      currentBlocked.add(coord);
    }

    const [updated] = await db
      .update(rooms)
      .set({ blockedSeats: Array.from(currentBlocked) })
      .where(eq(rooms.id, roomId))
      .returning();

    return toRoomDto(updated);
  } catch (error) {
    console.error('Failed to toggle blocked seat:', error);
    throw new Error('Failed to update seat maintenance block.', { cause: error });
  }
}

export async function deleteRoom(roomId: number): Promise<void> {
  try {
    await db.delete(rooms).where(eq(rooms.id, roomId));
  } catch (error) {
    console.error('Failed to delete room:', error);
    throw new Error('Failed to delete room.', { cause: error });
  }
}

export async function createExamSession(input: {
  title: string;
  examDate: string;
  timeSlot: string;
}): Promise<ExamSession> {
  try {
    const [row] = await db
      .insert(examSessions)
      .values({
        title: input.title.trim(),
        examDate: input.examDate.trim(),
        timeSlot: input.timeSlot.trim(),
        status: 'scheduled',
      })
      .returning();
    return toSessionDto(row);
  } catch (error) {
    console.error('Failed to create exam session:', error);
    throw new Error('Failed to create exam session.', { cause: error });
  }
}

export async function bulkCreateStudents(
  items: Array<{
    rollNumber: string;
    fullName: string;
    department: string;
    courseCode: string;
    examSessionId: number;
  }>
): Promise<StudentRecord[]> {
  try {
    if (items.length === 0) return [];
    const normalized = items.map((s) => ({
      rollNumber: s.rollNumber.trim().toUpperCase(),
      fullName: s.fullName.trim(),
      department: s.department.trim().toUpperCase(),
      courseCode: s.courseCode.trim().toUpperCase(),
      examSessionId: s.examSessionId,
    }));

    const inserted = await db
      .insert(students)
      .values(normalized)
      .onConflictDoNothing({ target: students.rollNumber })
      .returning();

    return inserted.map(toStudentDto);
  } catch (error) {
    console.error('Failed to insert students:', error);
    throw new Error('Failed to add students to roster.', { cause: error });
  }
}

export async function deleteStudent(studentId: number): Promise<void> {
  try {
    await db.delete(students).where(eq(students.id, studentId));
  } catch (error) {
    console.error('Failed to delete student:', error);
    throw new Error('Failed to remove student.', { cause: error });
  }
}

export async function runAndSaveSessionAllocation(input: {
  examSessionId: number;
  roomIds?: number[];
  strictDiagonal?: boolean;
}): Promise<AllocationRunReport> {
  try {
    const sessionStudentsRows = await db
      .select()
      .from(students)
      .where(eq(students.examSessionId, input.examSessionId));

    const allRoomsRows = input.roomIds && input.roomIds.length > 0
      ? await db
          .select()
          .from(rooms)
          .where(inArray(rooms.id, input.roomIds))
          .orderBy(asc(rooms.centerId), asc(rooms.roomNumber))
      : await db
          .select()
          .from(rooms)
          .orderBy(asc(rooms.centerId), asc(rooms.roomNumber));

    const sessionStudents = sessionStudentsRows.map(toStudentDto);
    const targetRooms = allRoomsRows.map(toRoomDto);

    const solverResult = runInterleavedAllocation(targetRooms, sessionStudents, {
      strictDiagonal: input.strictDiagonal ?? true,
    });

    await db.transaction(async (tx) => {
      await tx
        .delete(seatAllocations)
        .where(eq(seatAllocations.examSessionId, input.examSessionId));

      if (solverResult.placements.length > 0) {
        await tx.insert(seatAllocations).values(
          solverResult.placements.map((p) => ({
            examSessionId: input.examSessionId,
            roomId: p.roomId,
            studentId: p.studentId,
            seatRow: p.seatRow,
            seatCol: p.seatCol,
            checkedIn: false,
          }))
        );
      }

      await tx
        .update(examSessions)
        .set({ status: 'active' })
        .where(eq(examSessions.id, input.examSessionId));
    });

    return {
      sessionId: input.examSessionId,
      totalStudents: sessionStudents.length,
      placedCount: solverResult.placements.length,
      unplacedCount: solverResult.unplacedStudents.length,
      orthogonalConflicts: solverResult.orthogonalConflicts,
      diagonalConflicts: solverResult.diagonalConflicts,
      roomsUsed: solverResult.roomsUsed,
      unplacedRollNumbers: solverResult.unplacedStudents.map((s) => s.rollNumber),
    };
  } catch (error) {
    console.error('Allocation execution failed:', error);
    throw new Error('Failed to run automated seating allocation.', { cause: error });
  }
}

export async function clearSessionAllocations(examSessionId: number): Promise<void> {
  try {
    await db
      .delete(seatAllocations)
      .where(eq(seatAllocations.examSessionId, examSessionId));
  } catch (error) {
    console.error('Failed to clear session allocations:', error);
    throw new Error('Failed to clear session seating plan.', { cause: error });
  }
}

export async function swapOrMoveSeats(input: {
  examSessionId: number;
  roomId: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const [allocA] = await tx
        .select()
        .from(seatAllocations)
        .where(
          and(
            eq(seatAllocations.examSessionId, input.examSessionId),
            eq(seatAllocations.roomId, input.roomId),
            eq(seatAllocations.seatRow, input.fromRow),
            eq(seatAllocations.seatCol, input.fromCol)
          )
        );

      const [allocB] = await tx
        .select()
        .from(seatAllocations)
        .where(
          and(
            eq(seatAllocations.examSessionId, input.examSessionId),
            eq(seatAllocations.roomId, input.roomId),
            eq(seatAllocations.seatRow, input.toRow),
            eq(seatAllocations.seatCol, input.toCol)
          )
        );

      if (!allocA) {
        throw new Error('Source seat has no assigned student.');
      }

      if (allocB) {
        // Temporarily move allocA to an unused negative coordinate to satisfy unique index
        await tx
          .update(seatAllocations)
          .set({ seatRow: -999, seatCol: -999 })
          .where(eq(seatAllocations.id, allocA.id));

        await tx
          .update(seatAllocations)
          .set({ seatRow: input.fromRow, seatCol: input.fromCol })
          .where(eq(seatAllocations.id, allocB.id));

        await tx
          .update(seatAllocations)
          .set({ seatRow: input.toRow, seatCol: input.toCol })
          .where(eq(seatAllocations.id, allocA.id));
      } else {
        await tx
          .update(seatAllocations)
          .set({ seatRow: input.toRow, seatCol: input.toCol })
          .where(eq(seatAllocations.id, allocA.id));
      }
    });
  } catch (error) {
    console.error('Failed to swap seats:', error);
    throw new Error('Could not complete seat swap.', { cause: error });
  }
}

export async function toggleSeatCheckIn(
  allocationId: number,
  checkedIn: boolean
): Promise<void> {
  try {
    await db
      .update(seatAllocations)
      .set({ checkedIn })
      .where(eq(seatAllocations.id, allocationId));
  } catch (error) {
    console.error('Failed to update check-in status:', error);
    throw new Error('Failed to update examinee check-in state.', { cause: error });
  }
}

export async function unassignSeat(allocationId: number): Promise<void> {
  try {
    await db.delete(seatAllocations).where(eq(seatAllocations.id, allocationId));
  } catch (error) {
    console.error('Failed to unassign seat:', error);
    throw new Error('Failed to unassign seat.', { cause: error });
  }
}

export async function lookupStudents(query: string): Promise<LookupResult[]> {
  try {
    const snapshot = await getWorkspaceSnapshot();
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const sessionMap = new Map(snapshot.sessions.map((s) => [s.id, s]));
    const roomMap = new Map(snapshot.rooms.map((r) => [r.id, r]));
    const centerMap = new Map(snapshot.centers.map((c) => [c.id, c]));
    const allocByStudentSession = new Map<string, SeatAllocationItem>();

    for (const a of snapshot.allocations) {
      allocByStudentSession.set(`${a.examSessionId}:${a.studentId}`, a);
    }

    const matches = snapshot.students.filter(
      (s) =>
        s.rollNumber.toLowerCase().includes(q) ||
        s.fullName.toLowerCase().includes(q) ||
        s.courseCode.toLowerCase().includes(q)
    );

    return matches.slice(0, 25).map((student) => {
      const session = sessionMap.get(student.examSessionId)!;
      const allocation =
        allocByStudentSession.get(`${student.examSessionId}:${student.id}`) ?? null;
      const room = allocation ? roomMap.get(allocation.roomId) ?? null : null;
      const center = room ? centerMap.get(room.centerId) ?? null : null;

      return {
        student,
        session,
        allocation,
        room,
        center,
      };
    });
  } catch (error) {
    console.error('Failed to look up students:', error);
    throw new Error('Failed to search student seating records.', { cause: error });
  }
}
