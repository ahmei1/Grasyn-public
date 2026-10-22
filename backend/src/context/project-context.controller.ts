import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProjectContextService } from './project-context.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('context')
@Controller('projects/:projectId/context')
export class ProjectContextController {
  constructor(private readonly context: ProjectContextService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.context.forProject(user.id, projectId);
  }
}
