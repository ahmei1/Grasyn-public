import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { EventsService } from '../common/events.service';
import { GitHubAppService } from './github-app.service';
import { replaceRepositories } from './github.repositories';

const MANAGERS = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN];
const STATE_PURPOSE = 'github.install';
const CODE_LIMIT = 50;

const repositoryRef = {
  select: { id: true, fullName: true, htmlUrl: true },
} as const;
const linkedTasks = {
  select: {
    task: { select: { id: true, number: true, title: true, status: true } },
  },
} as const;

const pullRequestSelect = {
  id: true,
  number: true,
  title: true,
  url: true,
  state: true,
  draft: true,
  authorLogin: true,
  headBranch: true,
  baseBranch: true,
  reviewState: true,
  openedAt: true,
  mergedAt: true,
  closedAt: true,
  updatedAt: true,
  repository: repositoryRef,
  tasks: linkedTasks,
} satisfies Prisma.PullRequestSelect;

const commitSelect = {
  id: true,
  sha: true,
  message: true,
  url: true,
  branch: true,
  authorName: true,
  authorLogin: true,
  committedAt: true,
  repository: repositoryRef,
  tasks: linkedTasks,
} satisfies Prisma.CommitSelect;

type InstallState = { purpose: string; workspaceId: string; userId: string };

export type SetupQuery = {
  installationId?: string;
  state?: string;
};

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventsService,
    private readonly app: GitHubAppService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async status(userId: string, workspaceId: string) {
    await this.access.requireMembership(userId, workspaceId);
    const installation = await this.prisma.gitHubInstallation.findUnique({
      where: { workspaceId },
      select: {
        installationId: true,
        accountLogin: true,
        accountType: true,
        suspendedAt: true,
        createdAt: true,
        repositories: {
          select: {
            id: true,
            fullName: true,
            htmlUrl: true,
            private: true,
            project: { select: { id: true, name: true } },
          },
          orderBy: { fullName: 'asc' },
        },
      },
    });
    if (!installation) {
      return {
        configured: this.app.enabled,
        installation: null,
        repositories: [],
      };
    }
    const { repositories, installationId, ...account } = installation;
    return {
      configured: this.app.enabled,
      installation: {
        accountLogin: account.accountLogin,
        accountType: account.accountType,
        suspended: account.suspendedAt !== null,
        connectedAt: account.createdAt,
        manageUrl: manageUrl(account, installationId),
      },
      repositories,
    };
  }

  /** Signed, short-lived state ties GitHub's redirect back to this workspace. */
  async connect(userId: string, workspaceId: string) {
    await this.access.requireRoles(userId, workspaceId, MANAGERS);
    if (!this.app.enabled) {
      throw new ServiceUnavailableException({
        code: 'GITHUB_DISABLED',
        message: 'GitHub is not set up on this server',
      });
    }
    const existing = await this.prisma.gitHubInstallation.findUnique({
      where: { workspaceId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'GITHUB_CONNECTED',
        message: 'This workspace is already connected to GitHub',
      });
    }
    const state = await this.jwt.signAsync(
      { purpose: STATE_PURPOSE, workspaceId, userId } satisfies InstallState,
      { expiresIn: '10m' },
    );
    return { url: this.app.installUrl(state) };
  }

  /**
   * GitHub sends the browser here after an install or a repository change.
   * Returns where to send the browser next; failures become a query flag the
   * settings page explains.
   */
  async setup(query: SetupQuery): Promise<string> {
    const settings = `${this.frontendOrigin()}/app/settings/workspace`;
    const done = (result: string) => `${settings}?github=${result}`;
    const installationId = Number(query.installationId);
    if (!this.app.enabled) return done('disabled');
    if (!Number.isSafeInteger(installationId) || installationId < 1) {
      return done('missing');
    }

    if (!query.state) {
      // Repository changes made on GitHub come back without our state.
      const known = await this.prisma.gitHubInstallation.findUnique({
        where: { installationId: BigInt(installationId) },
        select: { id: true, workspaceId: true },
      });
      if (!known) return done('missing');
      try {
        const repositories = await this.app.listRepositories(installationId);
        await this.events.run(() =>
          this.prisma.$transaction((tx) =>
            replaceRepositories(tx, known, repositories).then(() =>
              this.changed(known.workspaceId),
            ),
          ),
        );
        return done('updated');
      } catch (error) {
        this.logger.warn(`Could not refresh repositories: ${String(error)}`);
        return done('github');
      }
    }

    let state: InstallState;
    try {
      state = await this.jwt.verifyAsync<InstallState>(query.state);
      if (state.purpose !== STATE_PURPOSE) throw new Error('Wrong purpose');
    } catch {
      return done('expired');
    }
    try {
      await this.access.requireRoles(state.userId, state.workspaceId, MANAGERS);
    } catch {
      return done('forbidden');
    }

    let account: Awaited<ReturnType<GitHubAppService['getInstallation']>>;
    let repositories: Awaited<ReturnType<GitHubAppService['listRepositories']>>;
    try {
      account = await this.app.getInstallation(installationId);
      repositories = await this.app.listRepositories(installationId);
    } catch (error) {
      this.logger.warn(`Could not read installation: ${String(error)}`);
      return done('github');
    }

    return this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        const [byInstallation, byWorkspace] = await Promise.all([
          tx.gitHubInstallation.findUnique({
            where: { installationId: BigInt(installationId) },
          }),
          tx.gitHubInstallation.findUnique({
            where: { workspaceId: state.workspaceId },
          }),
        ]);
        if (
          byInstallation &&
          byInstallation.workspaceId !== state.workspaceId
        ) {
          return done('taken');
        }
        if (
          byWorkspace &&
          byWorkspace.installationId !== BigInt(installationId)
        ) {
          return done('already');
        }
        const installation = await tx.gitHubInstallation.upsert({
          where: { workspaceId: state.workspaceId },
          create: {
            workspaceId: state.workspaceId,
            installationId: BigInt(installationId),
            accountLogin: account.login,
            accountType: account.type,
            connectedById: state.userId,
          },
          update: { accountLogin: account.login, accountType: account.type },
        });
        await replaceRepositories(tx, installation, repositories);
        if (!byWorkspace) {
          const metadata = {
            account: account.login,
            repositories: repositories.length,
          };
          await this.events.audit(
            {
              workspaceId: state.workspaceId,
              actorId: state.userId,
              action: 'github.connected',
              metadata,
            },
            tx,
          );
          await this.events.activity(
            {
              workspaceId: state.workspaceId,
              actorId: state.userId,
              type: 'github.connected',
              metadata,
            },
            tx,
          );
        }
        this.changed(state.workspaceId);
        return done('connected');
      }),
    );
  }

  /** Removes the link and its code history; the app stays installed on GitHub. */
  async disconnect(userId: string, workspaceId: string) {
    await this.access.requireRoles(userId, workspaceId, MANAGERS);
    return this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        const installation = await tx.gitHubInstallation.findUnique({
          where: { workspaceId },
        });
        if (!installation) {
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: 'This workspace is not connected to GitHub',
          });
        }
        await tx.gitHubInstallation.delete({ where: { id: installation.id } });
        const metadata = { account: installation.accountLogin };
        await this.events.audit(
          {
            workspaceId,
            actorId: userId,
            action: 'github.disconnected',
            metadata,
          },
          tx,
        );
        await this.events.activity(
          {
            workspaceId,
            actorId: userId,
            type: 'github.disconnected',
            metadata,
          },
          tx,
        );
        this.changed(workspaceId);
        return { disconnected: true };
      }),
    );
  }

  async mapRepository(
    userId: string,
    repositoryId: string,
    projectId: string | null,
  ) {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      select: { id: true, workspaceId: true, projectId: true },
    });
    if (!repository) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Repository not found',
      });
    }
    await this.access.requireRoles(userId, repository.workspaceId, MANAGERS);
    if (projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { workspaceId: true, archivedAt: true },
      });
      if (!project || project.workspaceId !== repository.workspaceId) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }
      if (project.archivedAt) {
        throw new BadRequestException({
          code: 'PROJECT_ARCHIVED',
          message: 'Archived projects cannot take a repository',
        });
      }
    }
    return this.events.run(async () => {
      const updated = await this.prisma.repository.update({
        where: { id: repository.id },
        data: { projectId },
        select: {
          id: true,
          fullName: true,
          htmlUrl: true,
          private: true,
          project: { select: { id: true, name: true } },
        },
      });
      this.changed(repository.workspaceId);
      for (const id of new Set([repository.projectId, projectId])) {
        if (id) this.changed(repository.workspaceId, id);
      }
      return updated;
    });
  }

  async forTask(userId: string, taskId: string) {
    const task = await this.access.requireTask(userId, taskId);
    const where = { tasks: { some: { taskId: task.id } } };
    const [pullRequests, commits] = await Promise.all([
      this.prisma.pullRequest.findMany({
        where,
        select: pullRequestSelect,
        orderBy: { updatedAt: 'desc' },
        take: CODE_LIMIT,
      }),
      this.prisma.commit.findMany({
        where,
        select: commitSelect,
        orderBy: { committedAt: 'desc' },
        take: CODE_LIMIT,
      }),
    ]);
    return {
      pullRequests: pullRequests.map(flattenTasks),
      commits: commits.map(flattenTasks),
    };
  }

  /** Code from repositories mapped to the project, plus anything naming its tasks. */
  async forProject(userId: string, projectId: string) {
    const project = await this.access.requireProject(userId, projectId);
    const where = {
      OR: [
        { repository: { projectId: project.id } },
        { tasks: { some: { task: { projectId: project.id } } } },
      ],
    };
    const [repositories, pullRequests, commits] = await Promise.all([
      this.prisma.repository.findMany({
        where: { projectId: project.id },
        select: { id: true, fullName: true, htmlUrl: true, private: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.pullRequest.findMany({
        where,
        select: pullRequestSelect,
        orderBy: { updatedAt: 'desc' },
        take: CODE_LIMIT,
      }),
      this.prisma.commit.findMany({
        where,
        select: commitSelect,
        orderBy: { committedAt: 'desc' },
        take: CODE_LIMIT,
      }),
    ]);
    return {
      repositories,
      pullRequests: pullRequests.map(flattenTasks),
      commits: commits.map(flattenTasks),
    };
  }

  private changed(workspaceId: string, projectId?: string) {
    this.events.publish({
      room: `workspace:${workspaceId}`,
      event: 'activity',
      data: {
        type: 'github.changed',
        workspaceId,
        projectId: projectId ?? null,
        taskId: null,
        meetingId: null,
      },
    });
  }

  private frontendOrigin() {
    return (
      this.config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173'
    );
  }
}

function manageUrl(
  account: { accountLogin: string; accountType: string },
  installationId: bigint,
) {
  return account.accountType === 'Organization'
    ? `https://github.com/organizations/${account.accountLogin}/settings/installations/${installationId}`
    : `https://github.com/settings/installations/${installationId}`;
}

function flattenTasks<T extends { tasks: { task: unknown }[] }>(item: T) {
  return { ...item, tasks: item.tasks.map((link) => link.task) };
}
