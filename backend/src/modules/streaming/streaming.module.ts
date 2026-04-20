import { Module } from '@nestjs/common';
import { StreamingService } from './streaming.service';
import { SonioxClientService } from './soniox-client.service';
import { IncrementalNoteService } from './incremental-note.service';
import { AudioUploadController } from './audio-upload.controller';
import { SseModule } from '../sse/sse.module';

@Module({
  controllers: [AudioUploadController],
  providers: [StreamingService, SonioxClientService, IncrementalNoteService],
  exports: [StreamingService, SonioxClientService, IncrementalNoteService],
  imports: [SseModule],
})
export class StreamingModule {}
