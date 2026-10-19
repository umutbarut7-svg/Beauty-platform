import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { BusinessRole, UserRole } from "@beauty-platform/types";
import type { PrismaService } from "../database/prisma.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { AuthenticatedUser } from "./auth.types.js";

export type Permission =
  | "business:read"
  | "business:create"
  | "business:update"
  | "member:read"
  | "member:manage"
  | "branch:create"
  | "branch:read"
  | "branch:update"
  | "service_category:create"
  | "service_category:read"
  | "service_category:update"
  | "service_category:delete"
  | "settings:read"
  | "settings:update"
  | "working_hours:read"
  | "working_hours:update"
  | "location:create"
  | "location:read"
  | "location:update"
  | "location:delete"
  | "staff:create"
  | "staff:read"
  | "staff:manage"
  | "staff:update"
  | "staff:delete"
  | "service:create"
  | "service:read"
  | "service:update"
  | "service:delete"
  | "staff_service:manage"
  | "appointment:read"
  | "appointment:manage"
  | "staff_schedule:manage"
  | "staff_schedule:read"
  | "customer:read"
  | "customer:manage"
  | "automation:read"
  | "automation:manage"
  | "notification:read"
  | "notification:manage"
  | "notification:send"
  | "notification:template:manage"
  | "notification:provider:manage"
  | "communication:read"
  | "communication:write"
  | "financial:read"
  | "financial:manage"
  | "growth:read"
  | "growth:manage"
  | "governance:read"
  | "governance:manage"
  | "governance:activate"
  | "governance:override"
  | "governance:case"
  | "privacy:manage";
type PermissionRole = UserRole | BusinessRole;
const MANAGEMENT_PERMISSIONS: readonly Permission[] = [
  "business:update",
  "member:read",
  "member:manage",
  "branch:create",
  "branch:read",
  "branch:update",
  "service_category:create",
  "service_category:read",
  "service_category:update",
  "service_category:delete",
  "settings:read",
  "settings:update",
  "working_hours:read",
  "working_hours:update",
  "location:create",
  "location:read",
  "location:update",
  "location:delete",
  "staff:create",
  "staff:manage",
  "staff:read",
  "staff:update",
  "staff:delete",
  "service:create",
  "service:read",
  "service:update",
  "service:delete",
  "staff_service:manage",
  "business:read",
  "appointment:read",
  "appointment:manage",
  "staff_schedule:manage",
  "staff_schedule:read",
  "customer:read",
  "customer:manage",
  "automation:read",
  "automation:manage",
  "notification:read",
  "notification:manage",
  "notification:send",
  "notification:template:manage",
  "notification:provider:manage",
  "communication:read",
  "communication:write",
  "financial:read",
  "financial:manage",
  "growth:read",
  "growth:manage",
  "governance:read",
  "governance:manage",
  "governance:activate",
  "governance:override",
  "governance:case",
  "privacy:manage",
];
const PERMISSIONS: Record<PermissionRole, readonly Permission[]> = {
  SUPER_ADMIN: [
    "business:create",
    "business:update",
    "location:create",
    "location:read",
    "location:update",
    "location:delete",
    "staff:create",
    "staff:manage",
    "staff:read",
    "staff:update",
    "staff:delete",
    "service:create",
    "service:read",
    "service:update",
    "service:delete",
    "staff_service:manage",
    "business:read",
    "business:update",
    "appointment:read",
    "appointment:manage",
    "staff_schedule:manage",
    "staff_schedule:read",
    "customer:read",
    "customer:manage",
    "automation:read",
    "automation:manage",
    "notification:read",
    "notification:manage",
    "notification:send",
    "notification:template:manage",
    "notification:provider:manage",
    "communication:read",
    "communication:write",
    "financial:read",
    "financial:manage",
    "growth:read",
    "growth:manage",
    "governance:read",
    "governance:manage",
    "governance:activate",
    "governance:override",
    "governance:case",
    "privacy:manage",
    "member:read",
    "member:manage",
    "branch:create",
    "branch:read",
    "branch:update",
    "service_category:create",
    "service_category:read",
    "service_category:update",
    "service_category:delete",
    "settings:read",
    "settings:update",
    "working_hours:read",
    "working_hours:update",
  ],
  BUSINESS_OWNER: ["business:create", ...MANAGEMENT_PERMISSIONS],
  BUSINESS_ADMIN: [
    "business:update",
    "location:create",
    "location:read",
    "location:update",
    "location:delete",
    "staff:create",
    "staff:manage",
    "staff:read",
    "staff:update",
    "staff:delete",
    "service:create",
    "service:read",
    "service:update",
    "service:delete",
    "staff_service:manage",
    "business:read",
    "business:update",
    "appointment:read",
    "appointment:manage",
    "staff_schedule:manage",
    "staff_schedule:read",
    "customer:read",
    "customer:manage",
    "automation:read",
    "automation:manage",
    "notification:read",
    "notification:manage",
    "notification:send",
    "notification:template:manage",
    "notification:provider:manage",
    "communication:read",
    "communication:write",
    "financial:read",
    "financial:manage",
    "growth:read",
    "growth:manage",
    "governance:read",
    "governance:manage",
    "governance:activate",
    "governance:override",
    "governance:case",
    "privacy:manage",
    "member:read",
    "member:manage",
    "branch:create",
    "branch:read",
    "branch:update",
    "service_category:create",
    "service_category:read",
    "service_category:update",
    "service_category:delete",
    "settings:read",
    "settings:update",
    "working_hours:read",
    "working_hours:update",
  ],
  MANAGER: [
    "business:read",
    "member:read",
    "service_category:create",
    "service_category:read",
    "service_category:update",
    "service_category:delete",
    "branch:create",
    "branch:read",
    "branch:update",
    "settings:read",
    "working_hours:read",
    "working_hours:update",
    "location:create",
    "location:read",
    "location:update",
    "staff:create",
    "staff:manage",
    "staff:read",
    "staff:update",
    "service:create",
    "service:read",
    "service:update",
    "staff_service:manage",
    "appointment:read",
    "appointment:manage",
    "staff_schedule:manage",
    "staff_schedule:read",
    "customer:read",
    "customer:manage",
    "automation:read",
    "automation:manage",
    "notification:read",
    "notification:manage",
    "notification:send",
    "notification:template:manage",
    "notification:provider:manage",
    "communication:read",
    "communication:write",
    "financial:read",
    "growth:read",
    "governance:read",
    "governance:case",
  ],
  STAFF: [
    "business:read",
    "location:read",
    "staff:read",
    "service:read",
    "service_category:read",
    "appointment:read",
    "customer:read",
    "automation:read",
    "notification:read",
    "communication:read",
    "communication:write",
    "staff_schedule:read",
  ],
  CUSTOMER: ["business:create", "appointment:read"],
};

@Injectable()
export class PermissionsService {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaService) {}
  has(role: PermissionRole, permission: Permission): boolean {
    return PERMISSIONS[role].includes(permission);
  }
  async assertBusinessAccess(
    user: AuthenticatedUser,
    businessId: string,
    permission: Permission,
  ): Promise<void> {
    if (user.role === "SUPER_ADMIN") {
      if (!this.has(user.role, permission))
        throw new ForbiddenException("Insufficient permission");
      return;
    }
    const membership = await this.prisma.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      select: { id: true, role: true },
    });
    if (!membership) throw new ForbiddenException("Business access denied");
    if (!this.has(membership.role as BusinessRole, permission))
      throw new ForbiddenException("Insufficient permission");
  }
}
