import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default('Administrator'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const examCenters = pgTable('exam_centers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  campusLocation: text('campus_location').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rooms = pgTable(
  'rooms',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => examCenters.id, { onDelete: 'cascade' })
      .notNull(),
    roomNumber: text('room_number').notNull(),
    floorWing: text('floor_wing').notNull(),
    rows: integer('rows').notNull(),
    cols: integer('cols').notNull(),
    blockedSeats: jsonb('blocked_seats').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('rooms_center_room_idx').on(table.centerId, table.roomNumber),
  ]
);

export const examSessions = pgTable('exam_sessions', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  examDate: text('exam_date').notNull(),
  timeSlot: text('time_slot').notNull(),
  status: text('status').notNull().default('scheduled'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  rollNumber: text('roll_number').notNull().unique(),
  fullName: text('full_name').notNull(),
  department: text('department').notNull(),
  courseCode: text('course_code').notNull(),
  examSessionId: integer('exam_session_id')
    .references(() => examSessions.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const seatAllocations = pgTable(
  'seat_allocations',
  {
    id: serial('id').primaryKey(),
    examSessionId: integer('exam_session_id')
      .references(() => examSessions.id, { onDelete: 'cascade' })
      .notNull(),
    roomId: integer('room_id')
      .references(() => rooms.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    seatRow: integer('seat_row').notNull(),
    seatCol: integer('seat_col').notNull(),
    checkedIn: boolean('checked_in').notNull().default(false),
    allocatedAt: timestamp('allocated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('alloc_session_student_idx').on(table.examSessionId, table.studentId),
    uniqueIndex('alloc_session_seat_idx').on(
      table.examSessionId,
      table.roomId,
      table.seatRow,
      table.seatCol
    ),
  ]
);

export const examCentersRelations = relations(examCenters, ({ many }) => ({
  rooms: many(rooms),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  center: one(examCenters, {
    fields: [rooms.centerId],
    references: [examCenters.id],
  }),
  allocations: many(seatAllocations),
}));

export const examSessionsRelations = relations(examSessions, ({ many }) => ({
  students: many(students),
  allocations: many(seatAllocations),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  examSession: one(examSessions, {
    fields: [students.examSessionId],
    references: [examSessions.id],
  }),
  allocations: many(seatAllocations),
}));

export const seatAllocationsRelations = relations(seatAllocations, ({ one }) => ({
  examSession: one(examSessions, {
    fields: [seatAllocations.examSessionId],
    references: [examSessions.id],
  }),
  room: one(rooms, {
    fields: [seatAllocations.roomId],
    references: [rooms.id],
  }),
  student: one(students, {
    fields: [seatAllocations.studentId],
    references: [students.id],
  }),
}));
