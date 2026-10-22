import { Injectable } from '@nestjs/common';
import { Prisma, PullRequestState, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../common/events.service';
import { findTaskNumbers, taskKey } from '../common/task-key';
import type { GitHubRepository } from './github-app.service';
import { saveRepository } from './github.repositories';

type Tx = Prisma.TransactionClient;
type Login = { login: string } | null | undefined;

type Installation = {
  id: string;
  workspaceId: string;
  workspace: { taskPrefix: string };
};

type LinkedTask = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  projectId: string;
  assigneeId: string | null;
};

type GitHubPull = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: 'open' | 'closed';
  draft?: boolean;
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  user: Login;
  head: { ref: string };
  base: { ref: string };
};

type GitHubCommit = {
  id: string;
  message: string;
  timestamp: string;
  url: string;
  author?: { name?: string; username?: string };
};

/** The parts of GitHub's payloads this service reads. GitHub signs them. */
export type WebhookPayload = {
  action?: string;
  installation?: { id: number };
  sender?: Login;
  repository?: GitHubRepository;
  ref?: string;
  deleted?: boolean;
  pusher?: { name?: string };
  commits?: GitHubCommit[];
  pull_request?: GitHubPull;
  review?: { state: string };
  repositories_added?: GitHubRepository[];
  repositories_removed?: { id: number }[];
};

export type WebhookResult = 'processed' | 'duplicate' | 'ignored';

const MESSAGE_LIMIT = 10_000;
const PUSH_SUMMARY_COMMITS = 5;
const REVIEW_STATES = new Set(['approved', 'changes_requested']);

const taskSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  projectId: true,
  assigneeId: true,
} satisfies Prisma.TaskSelect;

@Injectable()
export class GitHubWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /**
   * Records the delivery and its effects in one transaction, so a failure lets
   * GitHub's redelivery try again and a repeat delivery changes nothing.
   */
  handle(
    event: string,
    deliveryId: string,
    payload: WebhookPayload,
  ): Promise<WebhookResult> {
    return this.events.run(() =>
      this.prisma.$transaction(
        async (tx) => {
          const { count } = await tx.gitHubDelivery.createMany({
            data: [{ id: deliveryId, event }],
            skipDuplicates: true,
          });
          if (count === 0) return 'duplicate';
          const githubId = payload.installation?.id;
          if (typeof githubId !== 'number') return 'ignored';
          const installation = await tx.gitHubInstallation.findUnique({
            where: { installationId: BigInt(githubId) },
            select: {
              id: true,
              workspaceId: true,
              workspace: { select: { taskPrefix: true } },
            },
          });
          if (!installation) return 'ignored';
          const handled = await this.dispatch(tx, installation, event, payload);
          if (!handled) return 'ignored';
          this.events.publish({
            room: `workspace:${installation.workspaceId}`,
            event: 'activity',
            data: {
              type: 'github.changed',
              workspaceId: installation.workspaceId,
            },
          });
          return 'processed';
        },
        { timeout: 15_000 },
      ),
    );
  }

  private dispatch(
    tx: Tx,
    installation: Installation,
    event: string,
    payload: WebhookPayload,
  ): Promise<boolean> {
    switch (event) {
      case 'push':
        return this.push(tx, installation, payload);
      case 'pull_request':
      case 'pull_request_review':
        return this.pullRequest(tx, installation, event, payload);
      case 'installation':
        return this.installation(tx, installation, payload);
      case 'installation_repositories':
        return this.installationRepositories(tx, installation, payload);
      default:
        return Promise.resolve(false);
    }
  }

  private async push(
    tx: Tx,
    installation: Installation,
    payload: WebhookPayload,
  ) {
    const { ref, repository, commits } = payload;
    if (!ref?.startsWith('refs/heads/') || !repository || !commits?.length) {
      return false;
    }
    const branch = ref.slice('refs/heads/'.length);
    const repo = await saveRepository(tx, installation, repository);

    // A commit merged into another branch arrives again; it counts once.
    const known = await tx.commit.findMany({
      where: { repositoryId: repo.id, sha: { in: commits.map((c) => c.id) } },
      select: { sha: true },
    });
    const knownShas = new Set(known.map((commit) => commit.sha));
    const fresh = commits.filter((commit) => !knownShas.has(commit.id));
    if (fresh.length === 0) return true;

    await tx.commit.createMany({
      data: fresh.map((commit) => ({
        repositoryId: repo.id,
        sha: commit.id,
        message: commit.message.slice(0, MESSAGE_LIMIT),
        url: commit.url,
        branch,
        authorName: commit.author?.name ?? commit.author?.username ?? 'Unknown',
        authorLogin: commit.author?.username ?? null,
        committedAt: new Date(commit.timestamp),
      })),
      skipDuplicates: true,
    });
    const saved = await tx.commit.findMany({
      where: { repositoryId: repo.id, sha: { in: fresh.map((c) => c.id) } },
      select: { id: true, sha: true },
    });
    const idBySha = new Map(saved.map((commit) => [commit.sha, commit.id]));

    const texts = fresh.map((commit) => `${branch}\n${commit.message}`);
    const tasks = await this.tasksByNumber(tx, installation, texts);
    const byTask = new Map<
      string,
      { task: LinkedTask; commits: GitHubCommit[] }
    >();
    const links: { commitId: string; taskId: string }[] = [];
    fresh.forEach((commit, index) => {
      const commitId = idBySha.get(commit.id);
      if (!commitId) return;
      for (const number of findTaskNumbers(
        texts[index],
        installation.workspace.taskPrefix,
      )) {
        const task = tasks.get(number);
        if (!task) continue;
        links.push({ commitId, taskId: task.id });
        const entry = byTask.get(task.id) ?? { task, commits: [] };
        entry.commits.push(commit);
        byTask.set(task.id, entry);
      }
    });
    if (links.length > 0) {
      await tx.commitTask.createMany({ data: links, skipDuplicates: true });
    }

    const githubLogin = payload.sender?.login ?? payload.pusher?.name ?? null;
    for (const { task, commits: taskCommits } of byTask.values()) {
      await this.events.activity(
        {
          workspaceId: installation.workspaceId,
          type: 'code.pushed',
          projectId: task.projectId,
          taskId: task.id,
          metadata: {
            ...this.taskMeta(installation, task),
            githubLogin,
            repository: repo.fullName,
            branch,
            count: taskCommits.length,
            commits: taskCommits.slice(0, PUSH_SUMMARY_COMMITS).map((c) => ({
              sha: c.id.slice(0, 7),
              message: c.message.split('\n')[0].slice(0, 200),
              url: c.url,
            })),
          },
        },
        tx,
      );
    }
    return true;
  }

  private async pullRequest(
    tx: Tx,
    installation: Installation,
    event: 'pull_request' | 'pull_request_review',
    payload: WebhookPayload,
  ) {
    const { pull_request: pull, repository, action } = payload;
    if (!pull || !repository || !action) return false;
    const repo = await saveRepository(tx, installation, repository);
    const state = pull.merged_at
      ? PullRequestState.MERGED
      : pull.state === 'closed'
        ? PullRequestState.CLOSED
        : PullRequestState.OPEN;
    const reviewed =
      event === 'pull_request_review' &&
      action === 'submitted' &&
      REVIEW_STATES.has(payload.review?.state ?? '');
    const reviewState = reviewed ? payload.review!.state.toUpperCase() : null;
    const fields = {
      title: pull.title,
      url: pull.html_url,
      state,
      draft: pull.draft ?? false,
      authorLogin: pull.user?.login ?? 'unknown',
      headBranch: pull.head.ref,
      baseBranch: pull.base.ref,
      mergedAt: pull.merged_at ? new Date(pull.merged_at) : null,
      closedAt: pull.closed_at ? new Date(pull.closed_at) : null,
      ...(reviewState ? { reviewState } : {}),
    };
    const saved = await tx.pullRequest.upsert({
      where: {
        repositoryId_number: { repositoryId: repo.id, number: pull.number },
      },
      create: {
        ...fields,
        repositoryId: repo.id,
        number: pull.number,
        openedAt: new Date(pull.created_at),
      },
      update: fields,
      select: { id: true, tasks: { select: { taskId: true } } },
    });

    // The title, branch, and description decide the links; edits can drop one.
    const tasks = [
      ...(
        await this.tasksByNumber(tx, installation, [
          `${pull.title}\n${pull.head.ref}\n${pull.body ?? ''}`,
        ])
      ).values(),
    ];
    const previous = new Set(saved.tasks.map((link) => link.taskId));
    const current = new Set(tasks.map((task) => task.id));
    const removed = [...previous].filter((id) => !current.has(id));
    const added = tasks.filter((task) => !previous.has(task.id));
    if (removed.length > 0) {
      await tx.pullRequestTask.deleteMany({
        where: { pullRequestId: saved.id, taskId: { in: removed } },
      });
    }
    if (added.length > 0) {
      await tx.pullRequestTask.createMany({
        data: added.map((task) => ({
          pullRequestId: saved.id,
          taskId: task.id,
        })),
        skipDuplicates: true,
      });
    }

    const githubLogin = payload.sender?.login ?? null;
    const record = async (type: string, task: LinkedTask, extra = {}) => {
      await this.events.activity(
        {
          workspaceId: installation.workspaceId,
          type,
          projectId: task.projectId,
          taskId: task.id,
          metadata: {
            ...this.taskMeta(installation, task),
            githubLogin,
            repository: repo.fullName,
            number: pull.number,
            prTitle: pull.title,
            url: pull.html_url,
            ...extra,
          },
        },
        tx,
      );
    };
    const reference = `PR #${pull.number} in ${repo.fullName}`;
    const who = githubLogin ?? 'Someone';

    if (event === 'pull_request_review') {
      if (!reviewState) return true;
      const approved = reviewState === 'APPROVED';
      for (const task of tasks) {
        await record('code.pr_reviewed', task, { review: reviewState });
        await this.events.notify(
          {
            workspaceId: installation.workspaceId,
            userId: task.assigneeId ?? '',
            type: 'code.pr_reviewed',
            title: approved
              ? `${who} approved ${reference}`
              : `${who} asked for changes on ${reference}`,
            body: `"${pull.title}" for ${this.key(installation, task)} ${task.title}`,
            resourceType: 'task',
            resourceId: task.id,
          },
          tx,
        );
      }
      return true;
    }

    if (action === 'closed' && state === PullRequestState.MERGED) {
      for (const task of tasks) {
        await record('code.pr_merged', task);
        const key = this.key(installation, task);
        await this.events.notify(
          {
            workspaceId: installation.workspaceId,
            userId: task.assigneeId ?? '',
            type: 'code.pr_merged',
            title: `${reference} was merged`,
            body:
              task.status === TaskStatus.DONE
                ? `${who} merged "${pull.title}" for ${key}.`
                : `${who} merged "${pull.title}". If ${key} is finished, move it to Done.`,
            resourceType: 'task',
            resourceId: task.id,
          },
          tx,
        );
      }
    } else if (action === 'closed') {
      for (const task of tasks) await record('code.pr_closed', task);
    } else if (action === 'opened' || action === 'reopened') {
      const type = action === 'opened' ? 'code.pr_opened' : 'code.pr_reopened';
      for (const task of tasks) await record(type, task);
    } else {
      for (const task of added) await record('code.pr_linked', task);
    }
    return true;
  }

  private async installation(
    tx: Tx,
    installation: Installation,
    payload: WebhookPayload,
  ) {
    switch (payload.action) {
      case 'deleted': {
        const removed = await tx.gitHubInstallation.delete({
          where: { id: installation.id },
          select: { accountLogin: true },
        });
        await this.events.activity(
          {
            workspaceId: installation.workspaceId,
            type: 'github.disconnected',
            metadata: {
              account: removed.accountLogin,
              githubLogin: payload.sender?.login ?? null,
              uninstalled: true,
            },
          },
          tx,
        );
        return true;
      }
      case 'suspend':
      case 'unsuspend':
        await tx.gitHubInstallation.update({
          where: { id: installation.id },
          data: {
            suspendedAt: payload.action === 'suspend' ? new Date() : null,
          },
        });
        return true;
      default:
        return false;
    }
  }

  private async installationRepositories(
    tx: Tx,
    installation: Installation,
    payload: WebhookPayload,
  ) {
    for (const repository of payload.repositories_added ?? []) {
      await saveRepository(tx, installation, repository);
    }
    const removed = (payload.repositories_removed ?? []).map((r) =>
      BigInt(r.id),
    );
    if (removed.length > 0) {
      await tx.repository.deleteMany({
        where: { installationId: installation.id, githubId: { in: removed } },
      });
    }
    return true;
  }

  private async tasksByNumber(
    tx: Tx,
    installation: Installation,
    texts: string[],
  ) {
    const numbers = new Set(
      texts.flatMap((text) =>
        findTaskNumbers(text, installation.workspace.taskPrefix),
      ),
    );
    if (numbers.size === 0) return new Map<number, LinkedTask>();
    const tasks = await tx.task.findMany({
      where: {
        workspaceId: installation.workspaceId,
        number: { in: [...numbers] },
      },
      select: taskSelect,
      orderBy: { number: 'asc' },
    });
    return new Map(tasks.map((task) => [task.number, task]));
  }

  private key(installation: Installation, task: LinkedTask) {
    return taskKey(installation.workspace.taskPrefix, task.number);
  }

  private taskMeta(installation: Installation, task: LinkedTask) {
    return { title: task.title, taskKey: this.key(installation, task) };
  }
}
