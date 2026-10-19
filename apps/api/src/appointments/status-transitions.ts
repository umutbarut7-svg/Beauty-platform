import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from "@beauty-platform/types";

export { APPOINTMENT_STATUSES, type AppointmentStatus };

export const BLOCKING_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
];
export const TERMINAL_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionAppointment(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function timestampForStatus(status: AppointmentStatus, at: Date) {
  switch (status) {
    case "CONFIRMED":
      return { confirmedAt: at };
    case "CHECKED_IN":
      return { checkedInAt: at };
    case "IN_PROGRESS":
      return { serviceStartedAt: at };
    case "COMPLETED":
      return { completedAt: at };
    case "CANCELLED":
      return { cancelledAt: at };
    case "NO_SHOW":
      return { noShowAt: at };
    default:
      return {};
  }
}
