import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { GitHubService } from './github.service';
import { GitHubAppService } from './github-app.service';
import {
  GitHubWebhookService,
  type WebhookPayload,
} from './github-webhook.service';
import { MapRepositoryDto } from './dto/github.dto';

@ApiTags('github')
@Controller()
export class GitHubController {
  constructor(
    private readonly github: GitHubService,
    private readonly app: GitHubAppService,
    private readonly webhooks: GitHubWebhookService,
  ) {}

  @Get('workspaces/:workspaceId/github')
  status(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.github.status(user.id, workspaceId);
  }

  @Post('workspaces/:workspaceId/github/connect')
  connect(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.github.connect(user.id, workspaceId);
  }

  @Delete('workspaces/:workspaceId/github')
  disconnect(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.github.disconnect(user.id, workspaceId);
  }

  @Patch('github/repositories/:repositoryId')
  mapRepository(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Body() dto: MapRepositoryDto,
  ) {
    return this.github.mapRepository(user.id, repositoryId, dto.projectId);
  }

  @Get('tasks/:taskId/code')
  taskCode(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    return this.github.forTask(user.id, taskId);
  }

  @Get('projects/:projectId/code')
  projectCode(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return this.github.forProject(user.id, projectId);
  }

  /** GitHub's Setup URL. The browser arrives here straight from GitHub. */
  @Public()
  @ApiExcludeEndpoint()
  @Get('github/setup')
  async setup(
    @Query('installation_id') installationId: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const next = await this.github.setup({ installationId, state });
    res.redirect(302, next);
  }

  /** GitHub retries anything that is not 2xx, so only reject what a retry can't fix. */
  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  @Post('github/webhook')
  @HttpCode(202)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ) {
    if (!this.app.enabled) {
      throw new ServiceUnavailableException({
        code: 'GITHUB_DISABLED',
        message: 'GitHub is not set up on this server',
      });
    }
    if (!this.app.verifyWebhook(req.rawBody, signature)) {
      throw new UnauthorizedException({
        code: 'BAD_SIGNATURE',
        message: 'Webhook signature does not match',
      });
    }
    if (!event || !deliveryId || typeof req.body !== 'object' || !req.body) {
      throw new BadRequestException({
        code: 'BAD_WEBHOOK',
        message: 'Missing GitHub event headers or body',
      });
    }
    const result = await this.webhooks.handle(
      event,
      deliveryId,
      req.body as WebhookPayload,
    );
    return { result };
  }
}
