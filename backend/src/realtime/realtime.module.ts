import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway, PresenceService],
})
export class RealtimeModule {}
