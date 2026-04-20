import { Module } from '@nestjs/common';
import { StreamingWebSocketGateway } from './websocket.gateway';
import { StreamingModule } from '../streaming/streaming.module';

@Module({
  imports: [StreamingModule],
  providers: [StreamingWebSocketGateway],
  exports: [StreamingWebSocketGateway],
})
export class WebSocketModule {}
