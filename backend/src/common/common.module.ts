import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { EventsService } from './events.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';

@Global()
@Module({
  providers: [AccessService, EventsService, RealtimePublisher],
  exports: [AccessService, EventsService, RealtimePublisher],
})
export class CommonModule {}
