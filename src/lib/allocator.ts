import type { ConflictPair, ExamRoom, SeatAllocationItem, StudentRecord } from '../types/exam.ts';

export function makeSeatCoordKey(row: number, col: number): string {
  return `${row}-${col}`;
}

export function formatSeatLabel(row: number, col: number): string {
  return `R${String(row).padStart(2, '0')}-C${String(col).padStart(2, '0')}`;
}

interface PlacedStudent {
  student: StudentRecord;
  roomId: number;
  row: number;
  col: number;
}

export interface InterleavedSolverOutput {
  placements: Array<{
    roomId: number;
    studentId: number;
    seatRow: number;
    seatCol: number;
  }>;
  unplacedStudents: StudentRecord[];
  orthogonalConflicts: number;
  diagonalConflicts: number;
  roomsUsed: number;
}

function getNeighborPenalty(
  grid: Map<string, StudentRecord>,
  row: number,
  col: number,
  candidate: StudentRecord,
  strictDiagonal: boolean
): { orthogonal: number; diagonal: number; score: number } {
  const orthoOffsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const diagOffsets = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  let orthogonal = 0;
  let diagonal = 0;

  for (const [dr, dc] of orthoOffsets) {
    const neighbor = grid.get(makeSeatCoordKey(row + dr, col + dc));
    if (!neighbor) continue;
    const sameCourse = neighbor.courseCode === candidate.courseCode;
    const sameDept = neighbor.department === candidate.department;
    if (sameCourse || sameDept) {
      orthogonal += sameCourse && sameDept ? 2 : 1;
    }
  }

  for (const [dr, dc] of diagOffsets) {
    const neighbor = grid.get(makeSeatCoordKey(row + dr, col + dc));
    if (!neighbor) continue;
    const sameCourse = neighbor.courseCode === candidate.courseCode;
    const sameDept = neighbor.department === candidate.department;
    if (sameCourse || sameDept) {
      diagonal += sameCourse && sameDept ? 2 : 1;
    }
  }

  const score = orthogonal * 1000 + diagonal * (strictDiagonal ? 100 : 10);
  return { orthogonal, diagonal, score };
}

/**
 * Deterministic interleaved seating algorithm:
 * 1. Groups students into (courseCode + department) buckets sorted by size.
 * 2. Interleaves students round-robin across distinct cohorts.
 * 3. For each available seat across selected rooms, searches the remaining cohort
 *    pool to select the first candidate minimizing orthogonal and diagonal
 *    course/department adjacency.
 */
export function runInterleavedAllocation(
  targetRooms: ExamRoom[],
  sessionStudents: StudentRecord[],
  options: { strictDiagonal?: boolean } = {}
): InterleavedSolverOutput {
  const strictDiagonal = options.strictDiagonal ?? true;

  // Group students by (courseCode | department)
  const buckets = new Map<string, StudentRecord[]>();
  const sortedInput = [...sessionStudents].sort((a, b) =>
    a.rollNumber.localeCompare(b.rollNumber)
  );

  for (const student of sortedInput) {
    const key = `${student.courseCode}::${student.department}`;
    const list = buckets.get(key) ?? [];
    list.push(student);
    buckets.set(key, list);
  }

  // Build round-robin interleaved pool starting from largest cohorts
  const bucketQueues = Array.from(buckets.values()).sort(
    (a, b) => b.length - a.length
  );
  const pool: StudentRecord[] = [];
  let hasMore = true;
  while (hasMore) {
    hasMore = false;
    for (const q of bucketQueues) {
      if (q.length > 0) {
        pool.push(q.shift()!);
        hasMore = true;
      }
    }
  }

  const remaining = [...pool];
  const placements: InterleavedSolverOutput['placements'] = [];
  const usedRoomIds = new Set<number>();
  let totalOrthogonalConflicts = 0;
  let totalDiagonalConflicts = 0;

  const activeRooms = targetRooms.filter((r) => r.isActive);

  for (const room of activeRooms) {
    if (remaining.length === 0) break;

    const blockedSet = new Set(room.blockedSeats ?? []);
    const roomGrid = new Map<string, StudentRecord>();
    const placedInRoom: PlacedStudent[] = [];

    for (let r = 1; r <= room.rows; r++) {
      for (let c = 1; c <= room.cols; c++) {
        if (remaining.length === 0) break;
        const coord = makeSeatCoordKey(r, c);
        if (blockedSet.has(coord)) continue;

        let bestIndex = 0;
        let bestEval = getNeighborPenalty(
          roomGrid,
          r,
          c,
          remaining[0],
          strictDiagonal
        );

        if (bestEval.score > 0) {
          // Search across distinct cohort representatives in remaining pool
          const seenCohorts = new Set<string>();
          for (let i = 0; i < remaining.length; i++) {
            const cand = remaining[i];
            const cohortKey = `${cand.courseCode}::${cand.department}`;
            if (seenCohorts.has(cohortKey)) continue;
            seenCohorts.add(cohortKey);

            const evalResult = getNeighborPenalty(
              roomGrid,
              r,
              c,
              cand,
              strictDiagonal
            );
            if (evalResult.score < bestEval.score) {
              bestEval = evalResult;
              bestIndex = i;
              if (bestEval.score === 0) break;
            }
          }
        }

        const [chosen] = remaining.splice(bestIndex, 1);
        roomGrid.set(coord, chosen);
        placedInRoom.push({ student: chosen, roomId: room.id, row: r, col: c });
        placements.push({
          roomId: room.id,
          studentId: chosen.id,
          seatRow: r,
          seatCol: c,
        });
        usedRoomIds.add(room.id);
      }
    }

    // Count verified post-placement pairs in room
    const roomConflicts = analyzeRoomConflictsFromPlaced(placedInRoom);
    totalOrthogonalConflicts += roomConflicts.orthogonalCount;
    totalDiagonalConflicts += roomConflicts.diagonalCount;
  }

  return {
    placements,
    unplacedStudents: remaining,
    orthogonalConflicts: totalOrthogonalConflicts,
    diagonalConflicts: totalDiagonalConflicts,
    roomsUsed: usedRoomIds.size,
  };
}

function analyzeRoomConflictsFromPlaced(placed: PlacedStudent[]): {
  pairs: ConflictPair[];
  orthogonalCount: number;
  diagonalCount: number;
} {
  const byCoord = new Map<string, PlacedStudent>();
  for (const item of placed) {
    byCoord.set(makeSeatCoordKey(item.row, item.col), item);
  }

  const pairs: ConflictPair[] = [];
  let orthogonalCount = 0;
  let diagonalCount = 0;

  // Check forward neighbors only to avoid double-counting pairs
  const forwardOffsets: Array<{ dr: number; dc: number; type: 'orthogonal' | 'diagonal' }> = [
    { dr: 0, dc: 1, type: 'orthogonal' },
    { dr: 1, dc: 0, type: 'orthogonal' },
    { dr: 1, dc: 1, type: 'diagonal' },
    { dr: 1, dc: -1, type: 'diagonal' },
  ];

  for (const current of placed) {
    for (const { dr, dc, type } of forwardOffsets) {
      const other = byCoord.get(makeSeatCoordKey(current.row + dr, current.col + dc));
      if (!other) continue;
      const sameCourse = current.student.courseCode === other.student.courseCode;
      const sameDept = current.student.department === other.student.department;
      if (!sameCourse && !sameDept) continue;

      if (type === 'orthogonal') orthogonalCount++;
      else diagonalCount++;

      pairs.push({
        seatA: formatSeatLabel(current.row, current.col),
        seatB: formatSeatLabel(other.row, other.col),
        type,
        reason: sameCourse && sameDept ? 'both' : sameCourse ? 'same_course' : 'same_department',
        rollA: current.student.rollNumber,
        rollB: other.student.rollNumber,
      });
    }
  }

  return { pairs, orthogonalCount, diagonalCount };
}

export function analyzeRoomConflicts(
  allocations: SeatAllocationItem[]
): {
  pairs: ConflictPair[];
  orthogonalCount: number;
  diagonalCount: number;
  conflictedSeatKeys: Set<string>;
} {
  const placed: PlacedStudent[] = [];
  for (const alloc of allocations) {
    if (!alloc.student) continue;
    placed.push({
      student: alloc.student,
      roomId: alloc.roomId,
      row: alloc.seatRow,
      col: alloc.seatCol,
    });
  }

  const { pairs, orthogonalCount, diagonalCount } = analyzeRoomConflictsFromPlaced(placed);
  const conflictedSeatKeys = new Set<string>();
  for (const alloc of allocations) {
    const label = formatSeatLabel(alloc.seatRow, alloc.seatCol);
    if (pairs.some((p) => p.seatA === label || p.seatB === label)) {
      conflictedSeatKeys.add(makeSeatCoordKey(alloc.seatRow, alloc.seatCol));
    }
  }

  return { pairs, orthogonalCount, diagonalCount, conflictedSeatKeys };
}
