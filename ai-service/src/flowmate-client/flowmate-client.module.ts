import { Module } from '@nestjs/common';
import { FlowmateClientService } from './flowmate-client.service';

@Module({
  providers: [FlowmateClientService],
  exports: [FlowmateClientService],
})
export class FlowmateClientModule {}
