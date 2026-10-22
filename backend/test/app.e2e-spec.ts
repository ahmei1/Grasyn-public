import { AuthService } from '../src/auth/auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { EventsService } from '../src/common/events.service';
import { TasksService } from '../src/tasks/tasks.service';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createHmac, generateKeyPairSync, randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { GitHubAppService } from '../src/github/github-app.service';
import { ConfigService } from '@nestjs/config';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('API integration (real PostgreSQL)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const emails = [
    `review-${randomUUID()}@example.com`,
    `review-${randomUUID()}@example.com`,
    `review-${randomUUID()}@example.com`,
    `review-${randomUUID()}@example.com`,
    `review-${randomUUID()}@example.com`,
    `review-${randomUUID()}@example.com`,
  ];
  const webhookSecret = 'e2e-webhook-secret-0123456789';
  const deliveries: string[] = [];
  let githubApp: GitHubAppService;
  beforeAll(async () => {
    const keyPath = join(tmpdir(), `grasyn-e2e-${randomUUID()}.pem`);
    writeFileSync(
      keyPath,
      generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      }).privateKey,
    );
    const github: Record<string, string> = {
      GITHUB_APP_ID: '1000001',
      GITHUB_APP_SLUG: 'grasyn-e2e',
      GITHUB_APP_PRIVATE_KEY_PATH: keyPath,
      GITHUB_WEBHOOK_SECRET: webhookSecret,
    };
    githubApp = new GitHubAppService({
      get: (name: string) => github[name],
    } as unknown as ConfigService);
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GitHubAppService)
      .useValue(githubApp)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      rawBody: true,
      bodyParser: false,
    });
    prisma = app.get(PrismaService);
    setupApp(app);
    await app.init();
  });
  afterAll(async () => {
    if (prisma) {
      // Only remove data owned by this run's randomly named test accounts.
      const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      const ids = users.map((user) => user.id);
      await prisma.workspace.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.gitHubDelivery.deleteMany({
        where: { id: { in: deliveries } },
      });
    }
    await app?.close();
  });
  it('serves health and protects authenticated routes', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', service: 'grasyn-api' });
    await request(app.getHttpServer()).get('/api/workspaces').expect(401);
  });
  it('runs workspace → project → task and rejects invalid input and other tenants', async () => {
    const owner = request.agent(app.getHttpServer());
    const outsider = request.agent(app.getHttpServer());
    await owner
      .post('/api/auth/register')
      .send({
        email: emails[0],
        password: 'TestPassword123!',
        name: 'Review Owner',
      })
      .expect(201);
    await outsider
      .post('/api/auth/register')
      .send({
        email: emails[1],
        password: 'TestPassword123!',
        name: 'Review Outsider',
      })
      .expect(201);
    const ws = await owner
      .post('/api/workspaces')
      .send({ name: 'Review Test' })
      .expect(201);
    const { workspace } = ws.body as { workspace: { id: string } };
    const created = await owner
      .post(`/api/workspaces/${workspace.id}/projects`)
      .send({ name: 'Project' })
      .expect(201);
    const { project } = created.body as { project: { id: string } };
    await owner
      .get(
        `/api/workspaces/${workspace.id}/projects?status=ACTIVE&page=1&pageSize=10`,
      )
      .expect(200);
    await owner
      .get(`/api/workspaces/${workspace.id}/projects?status=INVALID`)
      .expect(400);
    await owner
      .patch(`/api/projects/${project.id}`)
      .send({ description: null })
      .expect(400);
    await outsider.get(`/api/projects/${project.id}`).expect(403);
    const createdTask = await owner
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Learn the request flow' })
      .expect(201);
    const { task } = createdTask.body as { task: { id: string } };
    await owner
      .get(`/api/projects/${project.id}/tasks?status=TODO&page=1&pageSize=10`)
      .expect(200);
    await owner
      .get(`/api/workspaces/${workspace.id}/tasks?status=TODO&page=1`)
      .expect(200);
    await owner
      .post(`/api/tasks/${task.id}/comments`)
      .send({ body: '  ' })
      .expect(400);
    await owner
      .post(`/api/tasks/${task.id}/comments`)
      .send({ body: 'Understood!' })
      .expect(201);
    await outsider.get(`/api/tasks/${task.id}/comments`).expect(403);
    const second = await owner
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Second card' })
      .expect(201);
    const secondTask = (second.body as { task: { id: string } }).task;
    await owner
      .patch(`/api/tasks/${secondTask.id}/position`)
      .send({ status: 'TODO', position: 0 })
      .expect(200);
    let board = await prisma.task.findMany({
      where: { projectId: project.id, status: 'TODO' },
      orderBy: { position: 'asc' },
    });
    expect(board.map((card) => [card.id, card.position])).toEqual([
      [secondTask.id, 0],
      [task.id, 1],
    ]);
    await owner
      .patch(`/api/tasks/${secondTask.id}`)
      .send({ status: 'DONE' })
      .expect(200);
    board = await prisma.task.findMany({
      where: { projectId: project.id, status: 'TODO' },
    });
    expect(board[0].position).toBe(0);
    const account = await prisma.user.findUniqueOrThrow({
      where: { email: emails[0] },
    });
    const activityFailure = jest
      .spyOn(app.get(EventsService), 'activity')
      .mockImplementationOnce(() => {
        throw new Error('Simulated activity failure');
      });
    try {
      await expect(
        app
          .get(TasksService)
          .create(account.id, project.id, { title: 'Must roll back' }),
      ).rejects.toThrow('Simulated activity failure');
      expect(
        await prisma.task.count({
          where: { projectId: project.id, title: 'Must roll back' },
        }),
      ).toBe(0);
    } finally {
      activityFailure.mockRestore();
    }
    await owner
      .patch(`/api/tasks/${task.id}`)
      .send({ dueDate: null, assigneeId: null })
      .expect(200);
    await owner
      .patch(`/api/projects/${project.id}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);
    const archived = await owner
      .get(`/api/workspaces/${workspace.id}/projects?status=ARCHIVED`)
      .expect(200);
    expect(
      (archived.body as { projects: { id: string }[] }).projects.map(
        (p) => p.id,
      ),
    ).toContain(project.id);
    const tokens = await app
      .get(PrismaService)
      .refreshToken.findMany({ where: { userId: account.id } });
    expect(tokens).toHaveLength(1);
    await owner.post('/api/auth/refresh').expect(201);
    await owner.get('/api/auth/me').expect(200);
    const invited = await owner
      .post(`/api/workspaces/${workspace.id}/invites`)
      .send({ email: emails[1] })
      .expect(201);
    const invite = (invited.body as { invite: { token: string } }).invite;
    await outsider.post(`/api/invites/${invite.token}/accept`).expect(201);
    const numbered = await prisma.task.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { number: 'asc' },
      select: { id: true, number: true },
    });
    expect(numbered.map((t) => t.id)).toEqual([task.id, secondTask.id]);
    expect(numbered.map((t) => t.number)).toEqual([1, 2]);
    await outsider
      .patch(`/api/workspaces/${workspace.id}`)
      .send({ taskPrefix: 'MINE' })
      .expect(403);
    await owner
      .patch(`/api/workspaces/${workspace.id}`)
      .send({ taskPrefix: '1X' })
      .expect(400);
    const renamed = await owner
      .patch(`/api/workspaces/${workspace.id}`)
      .send({ taskPrefix: ' rev ' })
      .expect(200);
    expect(
      (renamed.body as { workspace: { taskPrefix: string } }).workspace
        .taskPrefix,
    ).toBe('REV');
    await outsider
      .patch(`/api/projects/${project.id}`)
      .send({ status: 'ACTIVE' })
      .expect(403);
    const member = await prisma.user.findUniqueOrThrow({
      where: { email: emails[1] },
    });
    await owner
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: member.id })
      .expect(201);
    await owner
      .patch(`/api/tasks/${task.id}`)
      .send({ assigneeId: member.id })
      .expect(200);
    await outsider
      .patch(`/api/tasks/${task.id}`)
      .send({ status: 'IN_PROGRESS', description: 'Work started' })
      .expect(200);
    await outsider
      .patch(`/api/tasks/${task.id}`)
      .send({ status: 'DONE', title: 'Member changed the plan' })
      .expect(403);
    await outsider
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Member-created task', description: 'Basic details' })
      .expect(201);
    await outsider
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Member-planned task', priority: 'URGENT' })
      .expect(403);
    await outsider
      .patch(`/api/tasks/${secondTask.id}/position`)
      .send({ status: 'IN_PROGRESS', position: 0 })
      .expect(403);
    await owner
      .patch(`/api/workspaces/${workspace.id}/members/${member.id}`)
      .send({ role: 'ADMIN' })
      .expect(200);
    await outsider
      .patch(`/api/tasks/${secondTask.id}`)
      .send({ title: 'Admin can replan any task', priority: 'HIGH' })
      .expect(200);
    expect(
      await prisma.notification.count({
        where: { userId: member.id, workspaceId: workspace.id },
      }),
    ).toBeGreaterThan(0);
    await owner
      .delete(`/api/workspaces/${workspace.id}/members/${member.id}`)
      .expect(200);
    expect(
      await prisma.projectMember.count({
        where: { projectId: project.id, userId: member.id },
      }),
    ).toBe(0);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
        .assigneeId,
    ).toBeNull();
    await outsider.get(`/api/projects/${project.id}`).expect(403);
    await owner.post('/api/auth/logout').expect(201);
    await owner.get('/api/auth/me').expect(401);
    const auth = app.get(AuthService);
    const session = await auth.login(emails[0], 'TestPassword123!');
    const refreshes = await Promise.allSettled([
      auth.refresh(session.refreshToken),
      auth.refresh(session.refreshToken),
    ]);
    expect(
      refreshes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = refreshes.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(UnauthorizedException);
  });
  it('keeps a project discussion and meetings, and turns action items into tasks once', async () => {
    const owner = request.agent(app.getHttpServer());
    const teammate = request.agent(app.getHttpServer());
    await owner
      .post('/api/auth/register')
      .send({ email: emails[2], password: 'TestPassword123!', name: 'Lead' })
      .expect(201);
    await teammate
      .post('/api/auth/register')
      .send({ email: emails[3], password: 'TestPassword123!', name: 'Mate' })
      .expect(201);
    const { workspace } = (
      await owner
        .post('/api/workspaces')
        .send({ name: 'Meetings Test' })
        .expect(201)
    ).body as { workspace: { id: string } };
    const { project } = (
      await owner
        .post(`/api/workspaces/${workspace.id}/projects`)
        .send({ name: 'Launch' })
        .expect(201)
    ).body as { project: { id: string } };
    const mate = await prisma.user.findUniqueOrThrow({
      where: { email: emails[3] },
    });

    // Outsiders can neither read nor post.
    await teammate.get(`/api/projects/${project.id}/messages`).expect(403);
    await teammate
      .post(`/api/projects/${project.id}/messages`)
      .send({ body: 'Let me in' })
      .expect(403);

    const invite = (
      (
        await owner
          .post(`/api/workspaces/${workspace.id}/invites`)
          .send({ email: emails[3] })
          .expect(201)
      ).body as { invite: { token: string } }
    ).invite;
    await teammate.post(`/api/invites/${invite.token}/accept`).expect(201);

    await owner
      .post(`/api/projects/${project.id}/messages`)
      .send({ body: '   ' })
      .expect(400);
    const { message } = (
      await owner
        .post(`/api/projects/${project.id}/messages`)
        .send({ body: 'Kickoff tomorrow?' })
        .expect(201)
    ).body as { message: { id: string } };
    await teammate
      .post(`/api/projects/${project.id}/messages`)
      .send({ body: 'Works for me' })
      .expect(201);
    const lead = await prisma.user.findUniqueOrThrow({
      where: { email: emails[2] },
    });
    const unreadDiscussion = () =>
      prisma.notification.count({
        where: { userId: lead.id, type: 'project.message', readAt: null },
      });
    expect(await unreadDiscussion()).toBe(1);
    await owner.post(`/api/projects/${project.id}/messages/read`).expect(201);
    expect(await unreadDiscussion()).toBe(0);
    // Two more posts still leave the owner one unread notice, showing the latest.
    for (const body of ['Agenda coming', 'Also, agenda attached']) {
      await teammate
        .post(`/api/projects/${project.id}/messages`)
        .send({ body })
        .expect(201);
    }
    const unread = await prisma.notification.findMany({
      where: { userId: lead.id, type: 'project.message', readAt: null },
    });
    expect(unread).toHaveLength(1);
    expect(unread[0].body).toBe('Mate: Also, agenda attached');
    await teammate
      .patch(`/api/messages/${message.id}`)
      .send({ body: 'Not mine to edit' })
      .expect(403);
    await teammate.delete(`/api/messages/${message.id}`).expect(403);
    const page = (
      await owner
        .get(`/api/projects/${project.id}/messages?limit=1`)
        .expect(200)
    ).body as { messages: { body: string }[]; hasMore: boolean };
    expect(page.messages.map((m) => m.body)).toEqual(['Also, agenda attached']);
    expect(page.hasMore).toBe(true);

    await owner
      .post(`/api/projects/${project.id}/meetings`)
      .send({
        title: 'Backwards',
        startsAt: '2026-10-14T10:00:00Z',
        endsAt: '2026-10-14T09:00:00Z',
      })
      .expect(400);
    const { meeting } = (
      await owner
        .post(`/api/projects/${project.id}/meetings`)
        .send({
          title: 'Kickoff',
          startsAt: '2026-10-14T09:00:00Z',
          participantIds: [mate.id],
        })
        .expect(201)
    ).body as { meeting: { id: string; participants: unknown[] } };
    expect(meeting.participants).toHaveLength(2);
    expect(
      await prisma.notification.count({
        where: { userId: mate.id, type: 'meeting.invited' },
      }),
    ).toBe(1);

    // The invited member can take notes and record outcomes.
    await teammate
      .patch(`/api/meetings/${meeting.id}`)
      .send({ notes: 'Agreed on scope.' })
      .expect(200);
    await teammate
      .post(`/api/meetings/${meeting.id}/decisions`)
      .send({ body: 'Launch on Friday' })
      .expect(201);
    const withItems = (
      await teammate
        .post(`/api/meetings/${meeting.id}/action-items`)
        .send({ title: 'Write release notes' })
        .expect(201)
    ).body as { meeting: { actionItems: { id: string }[] } };
    const itemId = withItems.meeting.actionItems[0].id;
    await teammate.delete(`/api/meetings/${meeting.id}`).expect(403);

    const converted = (
      await teammate
        .post(`/api/meetings/${meeting.id}/action-items/${itemId}/task`)
        .expect(201)
    ).body as { task: { id: string; title: string } };
    expect(converted.task.title).toBe('Write release notes');
    await owner
      .post(`/api/meetings/${meeting.id}/action-items/${itemId}/task`)
      .expect(409);
    expect(
      await prisma.task.count({
        where: { projectId: project.id, title: 'Write release notes' },
      }),
    ).toBe(1);

    // Members still cannot plan through a meeting what they cannot plan by hand.
    const planned = (
      await teammate
        .post(`/api/meetings/${meeting.id}/action-items`)
        .send({ title: 'Ship it', assigneeId: mate.id })
        .expect(201)
    ).body as { meeting: { actionItems: { id: string; title: string }[] } };
    const plannedId = planned.meeting.actionItems.find(
      (item) => item.title === 'Ship it',
    )!.id;
    await teammate
      .post(`/api/meetings/${meeting.id}/action-items/${plannedId}/task`)
      .expect(403);
    expect(
      (
        await prisma.meetingActionItem.findUniqueOrThrow({
          where: { id: plannedId },
        })
      ).taskId,
    ).toBeNull();

    const context = (
      await owner.get(`/api/projects/${project.id}/context`).expect(200)
    ).body as {
      project: { name: string };
      tasks: { id: string; sourceMeetingId: string | null }[];
      discussion: { messages: { body: string }[] };
      meetings: {
        notes: string;
        decisions: { body: string }[];
        participants: { name: string }[];
      }[];
    };
    expect(context.project.name).toBe('Launch');
    expect(context.discussion.messages.map((m) => m.body)).toEqual([
      'Kickoff tomorrow?',
      'Works for me',
      'Agenda coming',
      'Also, agenda attached',
    ]);
    expect(context.meetings[0].notes).toBe('Agreed on scope.');
    expect(context.meetings[0].decisions[0].body).toBe('Launch on Friday');
    expect(context.meetings[0].participants.map((p) => p.name).sort()).toEqual([
      'Lead',
      'Mate',
    ]);
    expect(
      context.tasks.find((t) => t.id === converted.task.id)?.sourceMeetingId,
    ).toBe(meeting.id);
  });

  it('connects GitHub, links pushes and pull requests to tasks by key, and counts each delivery once', async () => {
    const owner = request.agent(app.getHttpServer());
    const teammate = request.agent(app.getHttpServer());
    await owner
      .post('/api/auth/register')
      .send({
        email: emails[4],
        password: 'TestPassword123!',
        name: 'Dev Lead',
      })
      .expect(201);
    await teammate
      .post('/api/auth/register')
      .send({
        email: emails[5],
        password: 'TestPassword123!',
        name: 'Dev Mate',
      })
      .expect(201);
    const { workspace } = (
      await owner
        .post('/api/workspaces')
        .send({ name: 'Code Test' })
        .expect(201)
    ).body as { workspace: { id: string; taskPrefix: string } };
    expect(workspace.taskPrefix).toBe('COD');
    const { invite } = (
      await owner
        .post(`/api/workspaces/${workspace.id}/invites`)
        .send({ email: emails[5] })
        .expect(201)
    ).body as { invite: { token: string } };
    await teammate.post(`/api/invites/${invite.token}/accept`).expect(201);
    const mate = await prisma.user.findUniqueOrThrow({
      where: { email: emails[5] },
    });
    const { project } = (
      await owner
        .post(`/api/workspaces/${workspace.id}/projects`)
        .send({ name: 'Web' })
        .expect(201)
    ).body as { project: { id: string } };
    const login = (
      await owner
        .post(`/api/projects/${project.id}/tasks`)
        .send({ title: 'Login page' })
        .expect(201)
    ).body as { task: { id: string } };
    const signup = (
      await owner
        .post(`/api/projects/${project.id}/tasks`)
        .send({ title: 'Signup flow', assigneeId: mate.id })
        .expect(201)
    ).body as { task: { id: string } };

    // Only managers connect; GitHub's redirect carries the signed state back.
    await teammate
      .post(`/api/workspaces/${workspace.id}/github/connect`)
      .expect(403);
    const { url } = (
      await owner
        .post(`/api/workspaces/${workspace.id}/github/connect`)
        .expect(201)
    ).body as { url: string };
    expect(url).toMatch(
      /^https:\/\/github\.com\/apps\/grasyn-e2e\/installations\/new\?state=/,
    );
    const state = new URL(url).searchParams.get('state')!;
    const installationId = 900_000_000 + Math.floor(Math.random() * 1e8);
    const repoId = 800_000_000 + Math.floor(Math.random() * 1e8);
    const repository = {
      id: repoId,
      full_name: 'acme/web',
      html_url: 'https://github.com/acme/web',
      default_branch: 'main',
      private: true,
    };
    jest
      .spyOn(githubApp, 'getInstallation')
      .mockResolvedValue({ login: 'acme', type: 'Organization' });
    jest.spyOn(githubApp, 'listRepositories').mockResolvedValue([repository]);
    const expired = await request(app.getHttpServer())
      .get(`/api/github/setup?installation_id=${installationId}&state=forged`)
      .expect(302);
    expect(expired.headers.location).toMatch(/\?github=expired$/);
    const connected = await request(app.getHttpServer())
      .get(
        `/api/github/setup?installation_id=${installationId}&setup_action=install&state=${state}`,
      )
      .expect(302);
    expect(connected.headers.location).toMatch(
      /\/app\/settings\/workspace\?github=connected$/,
    );
    const status = (
      await teammate.get(`/api/workspaces/${workspace.id}/github`).expect(200)
    ).body as {
      configured: boolean;
      installation: { accountLogin: string };
      repositories: { id: string; fullName: string }[];
    };
    expect(status.configured).toBe(true);
    expect(status.installation.accountLogin).toBe('acme');
    expect(status.repositories.map((r) => r.fullName)).toEqual(['acme/web']);
    const repo = status.repositories[0];
    await teammate
      .patch(`/api/github/repositories/${repo.id}`)
      .send({ projectId: project.id })
      .expect(403);
    await owner
      .patch(`/api/github/repositories/${repo.id}`)
      .send({ projectId: project.id })
      .expect(200);

    const deliver = (event: string, payload: object, id = randomUUID()) => {
      deliveries.push(id);
      const body = JSON.stringify(payload);
      return request(app.getHttpServer())
        .post('/api/github/webhook')
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', event)
        .set('X-GitHub-Delivery', id)
        .set(
          'X-Hub-Signature-256',
          `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`,
        )
        .send(body);
    };
    const installation = { id: installationId };
    const sender = { login: 'octocat' };

    await request(app.getHttpServer())
      .post('/api/github/webhook')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'ping')
      .set('X-GitHub-Delivery', randomUUID())
      .set('X-Hub-Signature-256', 'sha256=0000')
      .send('{}')
      .expect(401);

    const push = {
      ref: 'refs/heads/main',
      installation,
      repository,
      sender,
      commits: [
        {
          id: 'a'.repeat(40),
          message: 'cod-1: fix the login form\n\nLonger notes',
          timestamp: '2026-10-20T10:00:00Z',
          url: 'https://github.com/acme/web/commit/aaa',
          author: { name: 'Octo Cat', username: 'octocat' },
        },
        {
          id: 'b'.repeat(40),
          message: 'Tidy README (not COD-9999 or XCOD-1)',
          timestamp: '2026-10-20T10:05:00Z',
          url: 'https://github.com/acme/web/commit/bbb',
          author: { name: 'Octo Cat', username: 'octocat' },
        },
      ],
    };
    const pushId = randomUUID();
    expect((await deliver('push', push, pushId).expect(202)).body).toEqual({
      result: 'processed',
    });
    expect((await deliver('push', push, pushId).expect(202)).body).toEqual({
      result: 'duplicate',
    });
    expect(
      await prisma.commit.count({ where: { repositoryId: repo.id } }),
    ).toBe(2);
    const loginCode = (
      await teammate.get(`/api/tasks/${login.task.id}/code`).expect(200)
    ).body as { commits: { sha: string }[] };
    expect(loginCode.commits.map((c) => c.sha)).toEqual(['a'.repeat(40)]);

    const pull = {
      number: 7,
      title: 'Signup flow',
      body: 'Also touches COD-1',
      html_url: 'https://github.com/acme/web/pull/7',
      state: 'open',
      draft: false,
      merged_at: null,
      closed_at: null,
      created_at: '2026-10-20T11:00:00Z',
      user: sender,
      head: { ref: 'feature/COD-2-signup' },
      base: { ref: 'main' },
    };
    const linkedTo = async () =>
      (
        await prisma.pullRequestTask.findMany({
          where: { pullRequest: { repositoryId: repo.id, number: 7 } },
          select: { taskId: true },
        })
      )
        .map((link) => link.taskId)
        .sort();
    await deliver('pull_request', {
      action: 'opened',
      installation,
      repository,
      sender,
      pull_request: pull,
    }).expect(202);
    expect(await linkedTo()).toEqual([login.task.id, signup.task.id].sort());
    await deliver('pull_request', {
      action: 'edited',
      installation,
      repository,
      sender,
      pull_request: { ...pull, body: 'Just the signup' },
    }).expect(202);
    expect(await linkedTo()).toEqual([signup.task.id]);
    await deliver('pull_request_review', {
      action: 'submitted',
      installation,
      repository,
      sender: { login: 'reviewer' },
      review: { state: 'approved' },
      pull_request: { ...pull, body: 'Just the signup' },
    }).expect(202);
    await deliver('pull_request', {
      action: 'closed',
      installation,
      repository,
      sender,
      pull_request: {
        ...pull,
        body: 'Just the signup',
        state: 'closed',
        merged_at: '2026-10-20T12:00:00Z',
        closed_at: '2026-10-20T12:00:00Z',
      },
    }).expect(202);

    const signupCode = (
      await teammate.get(`/api/tasks/${signup.task.id}/code`).expect(200)
    ).body as {
      pullRequests: { state: string; reviewState: string; tasks: unknown[] }[];
    };
    expect(signupCode.pullRequests).toEqual([
      expect.objectContaining({ state: 'MERGED', reviewState: 'APPROVED' }),
    ]);
    const notified = await prisma.notification.findMany({
      where: {
        userId: mate.id,
        workspaceId: workspace.id,
        type: { startsWith: 'code.' },
      },
      orderBy: { createdAt: 'asc' },
      select: { type: true, title: true, body: true },
    });
    expect(notified).toEqual([
      expect.objectContaining({
        type: 'code.pr_reviewed',
        title: 'reviewer approved PR #7 in acme/web',
      }),
      expect.objectContaining({
        type: 'code.pr_merged',
        title: 'PR #7 in acme/web was merged',
        body: 'octocat merged "Signup flow". If COD-2 is finished, move it to Done.',
      }),
    ]);
    const merged = await prisma.activityEvent.findFirstOrThrow({
      where: { taskId: signup.task.id, type: 'code.pr_merged' },
    });
    expect(merged.actorId).toBeNull();
    expect(merged.metadata).toMatchObject({
      githubLogin: 'octocat',
      taskKey: 'COD-2',
    });

    const projectCode = (
      await teammate.get(`/api/projects/${project.id}/code`).expect(200)
    ).body as { pullRequests: unknown[]; commits: unknown[] };
    expect(projectCode.commits).toHaveLength(2);
    expect(projectCode.pullRequests).toHaveLength(1);
    const context = (
      await teammate.get(`/api/projects/${project.id}/context`).expect(200)
    ).body as { code: { pullRequests: { taskIds: string[] }[] } };
    expect(context.code.pullRequests[0].taskIds).toEqual([signup.task.id]);

    expect(
      (
        await deliver('push', {
          ...push,
          installation: { id: installationId + 1 },
        }).expect(202)
      ).body,
    ).toEqual({ result: 'ignored' });
    await deliver('installation', {
      action: 'deleted',
      installation,
      sender,
    }).expect(202);
    const after = (
      await owner.get(`/api/workspaces/${workspace.id}/github`).expect(200)
    ).body as { installation: unknown };
    expect(after.installation).toBeNull();
    expect(await prisma.repository.count({ where: { githubId: repoId } })).toBe(
      0,
    );
  });

  it('rejects browser mutations from untrusted origins', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://untrusted.example')
      .send({ email: emails[0], password: 'TestPassword123!' })
      .expect(403);
  });
});
