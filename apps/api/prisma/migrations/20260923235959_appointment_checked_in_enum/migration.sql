-- PostgreSQL requires a newly added enum value to be committed before it is used
-- in a later migration transaction (e.g. a partial exclusion constraint).
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'CHECKED_IN' AFTER 'CONFIRMED';
