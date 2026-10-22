import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';

const MESSAGE_LIMIT = 200;
const ACTIVITY_LIMIT = 100;
const CODE_LIMIT = 100;
const person = { select: { id: true, name: true } } as const;

/**
 * Everything a reader (or a summarizing model) needs to understand a project,
 * in one stable, plain-JSON shape. Lists are oldest-first so they read as a
 * timeline.
 */
@Injectable()
export class ProjectContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async forProject(userId: string, projectId: string) {
    const project = await this.access.requireProject(userId, projectId);

    const codeWhere = {
      OR: [
        { repository: { projectId: project.id } },
        { tasks: { some: { task: { projectId: project.id } } } },
      ],
    };
    const linkedTaskIds = {
      select: { taskId: true },
    } as const;
    const [owner, tasks, messages, meetings, activity, pullRequests, commits] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: project.ownerId },
          ...person,
        }),
        this.prisma.task.findMany({
          where: { projectId: project.id },
          select: {
            id: true,
            number: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            dueDate: true,
            createdAt: true,
            updatedAt: true,
            assignee: person,
            fromAction: { select: { meetingId: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.message.findMany({
          where: { projectId: project.id },
          select: {
            id: true,
            body: true,
            createdAt: true,
            editedAt: true,
            author: person,
          },
          orderBy: { createdAt: 'desc' },
          take: MESSAGE_LIMIT,
        }),
        this.prisma.meeting.findMany({
          where: { projectId: project.id },
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            notes: true,
            participants: { select: { user: person } },
            decisions: {
              select: { body: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
            },
            actionItems: {
              select: {
                title: true,
                dueDate: true,
                taskId: true,
                assignee: person,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { startsAt: 'asc' },
        }),
        this.prisma.activityEvent.findMany({
          where: { projectId: project.id },
          select: {
            type: true,
            taskId: true,
            metadata: true,
            createdAt: true,
            actor: person,
          },
          orderBy: { createdAt: 'desc' },
          take: ACTIVITY_LIMIT,
        }),
        this.prisma.pullRequest.findMany({
          where: codeWhere,
          select: {
            number: true,
            title: true,
            url: true,
            state: true,
            authorLogin: true,
            headBranch: true,
            reviewState: true,
            openedAt: true,
            mergedAt: true,
            repository: { select: { fullName: true } },
            tasks: linkedTaskIds,
          },
          orderBy: { updatedAt: 'desc' },
          take: CODE_LIMIT,
        }),
        this.prisma.commit.findMany({
          where: codeWhere,
          select: {
            sha: true,
            message: true,
            branch: true,
            authorName: true,
            committedAt: true,
            repository: { select: { fullName: true } },
            tasks: linkedTaskIds,
          },
          orderBy: { committedAt: 'desc' },
          take: CODE_LIMIT,
        }),
      ]);
    const flatten = <
      T extends {
        repository: { fullName: string };
        tasks: { taskId: string }[];
      },
    >({
      repository,
      tasks: links,
      ...item
    }: T) => ({
      ...item,
      repository: repository.fullName,
      taskIds: links.map((link) => link.taskId),
    });

    return {
      generatedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        priority: project.priority,
        dueDate: project.dueDate,
        owner,
      },
      tasks: tasks.map(({ fromAction, ...task }) => ({
        ...task,
        sourceMeetingId: fromAction?.meetingId ?? null,
      })),
      discussion: {
        messages: messages.reverse(),
        truncated: messages.length === MESSAGE_LIMIT,
      },
      meetings: meetings.map(({ participants, ...meeting }) => ({
        ...meeting,
        participants: participants.map((p) => p.user),
      })),
      activity: activity.reverse(),
      code: {
        pullRequests: pullRequests.reverse().map(flatten),
        commits: commits.reverse().map(flatten),
        truncated:
          pullRequests.length === CODE_LIMIT || commits.length === CODE_LIMIT,
      },
    };
  }
}
