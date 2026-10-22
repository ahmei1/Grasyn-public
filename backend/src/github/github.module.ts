import { Module } from '@nestjs/common';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';
import { GitHubAppService } from './github-app.service';
import { GitHubWebhookService } from './github-webhook.service';

@Module({
  controllers: [GitHubController],
  providers: [GitHubService, GitHubAppService, GitHubWebhookService],
})
export class GitHubModule {}
