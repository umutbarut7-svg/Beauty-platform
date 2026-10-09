import { BusinessRole, PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const passwordHash = await hash("Local-development-only-1!", 12);
const business = await prisma.business.upsert({
  where: { id: "demo-business" },
  update: {},
  create: { id: "demo-business", name: "Demo Studio", slug: "demo-studio" },
});
const user = await prisma.user.upsert({
  where: { email: "owner@example.invalid" },
  update: {},
  create: {
    email: "owner@example.invalid",
    passwordHash,
    role: UserRole.BUSINESS_OWNER,
  },
});
await prisma.businessMember.upsert({
  where: { userId_businessId: { userId: user.id, businessId: business.id } },
  update: {},
  create: {
    userId: user.id,
    businessId: business.id,
    role: BusinessRole.BUSINESS_OWNER,
  },
});
await prisma.$disconnect();
