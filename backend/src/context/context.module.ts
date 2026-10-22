import { Module } from '@nestjs/common';
import { ProjectContextService } from './project-context.service';
import { ProjectContextController } from './project-context.controller';

@Module({
  controllers: [ProjectContextController],
  providers: [ProjectContextService],
})
export class ContextModule {}
