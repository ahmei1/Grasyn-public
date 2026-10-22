import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate limits HTTP routes. Socket joins are checked by membership instead. */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }
}
