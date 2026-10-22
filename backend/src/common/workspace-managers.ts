import { Prisma, WorkspaceRole } from '@prisma/client';

/** Owners and admins oversee every project, so they hear about task changes too. */
export async function workspaceManagerIds(
  db: Prisma.TransactionClient,
  workspaceId: string,
): Promise<string[]> {
  const managers = await db.workspaceMember.findMany({
    where: {
      workspaceId,
      role: { in: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] },
    },
    select: { userId: true },
  });
  return managers.map((manager) => manager.userId);
}
