import type { UserRole } from "@beauty-platform/types";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  sessionId?: string;
}
export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  sid?: string;
  type: "access" | "refresh";
}
export interface RequestWithUser {
  user: AuthenticatedUser;
  params?: Record<string, string>;
}
