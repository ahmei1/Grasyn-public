import { Prisma } from '@prisma/client';
import type { GitHubRepository } from './github-app.service';

type InstallationRef = { id: string; workspaceId: string };

/** Webhook payloads for added repositories carry no URL or default branch. */
export function saveRepository(
  tx: Prisma.TransactionClient,
  installation: InstallationRef,
  repository: GitHubRepository,
) {
  const data = {
    fullName: repository.full_name,
    htmlUrl:
      repository.html_url ?? `https://github.com/${repository.full_name}`,
    private: repository.private,
    ...(repository.default_branch
      ? { defaultBranch: repository.default_branch }
      : {}),
  };
  return tx.repository.upsert({
    where: { githubId: BigInt(repository.id) },
    create: {
      ...data,
      githubId: BigInt(repository.id),
      workspaceId: installation.workspaceId,
      installationId: installation.id,
    },
    update: data,
    select: { id: true, fullName: true, projectId: true },
  });
}

/** Makes the stored list match GitHub's; dropped repositories lose their history. */
export async function replaceRepositories(
  tx: Prisma.TransactionClient,
  installation: InstallationRef,
  repositories: GitHubRepository[],
) {
  for (const repository of repositories) {
    await saveRepository(tx, installation, repository);
  }
  await tx.repository.deleteMany({
    where: {
      installationId: installation.id,
      githubId: { notIn: repositories.map((r) => BigInt(r.id)) },
    },
  });
}
