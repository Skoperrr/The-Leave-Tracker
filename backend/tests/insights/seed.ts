import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { org, ava, bongi, annual, now } from "./fixture.js";
export const actor = randomUUID(),
  other = randomUUID();
export async function seedInsightsFixture(db: PrismaClient) {
  await db.organisation.create({
    data: { id: org, name: "Temporary insights fixture", slug: org },
  });
  await db.user.createMany({
    data: [
      { id: actor, email: `${actor}@example.invalid`, fullName: "Ava" },
      { id: other, email: `${other}@example.invalid`, fullName: "Bongi" },
    ],
  });
  await db.membership.create({
    data: { id: ava, userId: actor, organisationId: org, role: "ADMIN" },
  });
  await db.membership.create({
    data: {
      id: bongi,
      userId: other,
      organisationId: org,
      managerMembershipId: ava,
    },
  });
  await db.leaveType.create({ data: { ...annual, organisationId: org } });
  await db.leaveBalance.createMany({
    data: [ava, bongi].map((membershipId) => ({
      membershipId,
      organisationId: org,
      leaveTypeId: annual.id,
      year: 2026,
      allocatedDays: 15,
    })),
  });
  await db.leaveRequest.createMany({
    data: [
      {
        membershipId: ava,
        userId: actor,
        status: "APPROVED" as const,
        startDate: new Date("2026-10-30"),
        endDate: new Date("2026-11-02"),
        workingDays: 2,
      },
      {
        membershipId: ava,
        userId: actor,
        status: "PENDING" as const,
        startDate: new Date("2026-11-03"),
        endDate: new Date("2026-11-04"),
        workingDays: 2,
      },
      {
        membershipId: bongi,
        userId: other,
        status: "APPROVED" as const,
        startDate: new Date("2026-11-02"),
        endDate: new Date("2026-11-02"),
        workingDays: 1,
      },
    ].map((row) => ({
      ...row,
      organisationId: org,
      leaveTypeId: annual.id,
      reason: "PRIVATE DO NOT EXPOSE",
      ...(row.status === "APPROVED"
        ? {
            approverMembershipId: row.membershipId === ava ? bongi : ava,
            decidedAt: now,
            decisionComment: "PRIVATE COMMENT",
          }
        : {}),
    })),
  });
}
export async function cleanInsightsFixture(db: PrismaClient) {
  await db.leaveRequest.deleteMany({ where: { organisationId: org } });
  await db.leaveBalance.deleteMany({ where: { organisationId: org } });
  await db.membership.updateMany({
    where: { organisationId: org },
    data: { managerMembershipId: null },
  });
  await db.membership.deleteMany({ where: { organisationId: org } });
  await db.leaveType.deleteMany({ where: { organisationId: org } });
  await db.organisation.deleteMany({ where: { id: org } });
  await db.user.deleteMany({ where: { id: { in: [actor, other] } } });
}
