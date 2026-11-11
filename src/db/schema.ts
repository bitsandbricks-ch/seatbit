import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------- Better Auth tables ----------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  role: text("role").default("member").notNull(), // "admin" | "member"
  emailReminders: integer("email_reminders", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(now)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------- App tables ----------

export const lan = sqliteTable("lan", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  location: text("location").default("").notNull(),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
  /** Attendance must be decided by this date. */
  signupDeadline: integer("signup_deadline", { mode: "timestamp_ms" }),
  /** Payment is due by this date. */
  paymentDueDate: integer("payment_due_date", { mode: "timestamp_ms" }),
  price: text("price").default("").notNull(),
  /** Max. attendees with status "going"; null = unlimited. */
  capacity: integer("capacity"),
  /** Send due-date reminders this many days before a deadline. */
  reminderDays: integer("reminder_days").default(3).notNull(),
  seatRows: integer("seat_rows").default(6).notNull(),
  seatCols: integer("seat_cols").default(10).notNull(),
  /** Whether attendees may pick their own seats. */
  seatingOpen: integer("seating_open", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

export const ATTENDANCE_STATUSES = ["going", "maybe", "declined", "waitlist"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const attendance = sqliteTable(
  "attendance",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<AttendanceStatus>().notNull(),
    paid: integer("paid", { mode: "boolean" }).default(false).notNull(),
    note: text("note").default("").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("attendance_lan_user_uq").on(t.lanId, t.userId)],
);

/** Nicknames: lanId null = global nick, otherwise only for that LAN. */
export const nickname = sqliteTable(
  "nickname",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lanId: text("lan_id").references(() => lan.id, { onDelete: "cascade" }),
    nick: text("nick").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("nickname_user_idx").on(t.userId, t.lanId)],
);

/** One row per seat cell in a LAN's seating grid. Cells without a row are aisles/empty. */
export const seat = sqliteTable(
  "seat",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    label: text("label").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Locked seats can only be assigned by admins. */
    locked: integer("locked", { mode: "boolean" }).default(false).notNull(),
  },
  (t) => [
    uniqueIndex("seat_lan_pos_uq").on(t.lanId, t.row, t.col),
    uniqueIndex("seat_lan_user_uq").on(t.lanId, t.userId),
  ],
);

export const REMINDER_KINDS = ["signup", "payment", "event", "waitlist_promoted"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const reminderLog = sqliteTable(
  "reminder_log",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ReminderKind>().notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("reminder_log_uq").on(t.lanId, t.userId, t.kind)],
);

export type User = typeof user.$inferSelect;
export type Lan = typeof lan.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type Nickname = typeof nickname.$inferSelect;
export type Seat = typeof seat.$inferSelect;
