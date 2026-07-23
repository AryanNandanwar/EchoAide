import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { StreamingService } from '../streaming/streaming.service';
import { Logger } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { writeFileSync } from 'fs';
import { join } from 'path';

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@Controller('upload-audio')
export class AudioUploadController {
  private readonly logger = new Logger(AudioUploadController.name);

  constructor(private readonly streamingService: StreamingService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = uuidv4();
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 25 * 1024 * 1024, // 25MB
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'audio/wav',
          'audio/mp3',
          'audio/mpeg',
          'audio/m4a',
          'audio/ogg',
          'audio/x-wav',
          'audio/x-m4a',
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new HttpException('Invalid file type. Only audio files are allowed.', HttpStatus.BAD_REQUEST), false);
        }
      },
    }),
  )
  async uploadAudio(
    @UploadedFile() file: UploadedFile,
    @Req() req: Request,
    @Body() body: { patientId?: string; doctorId?: string } = {},
  ) {
    if (!file) {
      throw new HttpException('Audio file is required.', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(`Processing audio upload: ${file.originalname} (${file.size} bytes)`);

      // Read the uploaded file
      const fs = require('fs');
      const audioBuffer = fs.readFileSync(file.path);

      // Create a temporary session for processing
      const clientId = req.headers['authorization']?.replace('Bearer ', '') || 'upload-client';
      const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Start a streaming session for processing
      await this.streamingService.startRecording(clientId, sessionId);

      // Process the entire audio file at once
      await this.streamingService.processAudioChunk(clientId, audioBuffer.buffer, Date.now());

      // Stop the session to trigger final note generation (only if patientId and doctorId provided)
      if (body.patientId && body.doctorId) {
        await this.streamingService.stopRecording(clientId, sessionId, body.patientId, body.doctorId);
      } else {
        // Skip note storage if patient/doctor info not provided
        this.logger.log('Skipping clinical note storage - patientId and doctorId not provided');
        // Call a version that doesn't store notes
        await this.streamingService.stopRecordingWithoutNoteStorage(clientId, sessionId);
      }

      // Clean up the uploaded file
      fs.unlinkSync(file.path);

      this.logger.log(`Audio upload processed successfully: ${sessionId}`);

      return {
        success: true,
        message: 'Audio file processed successfully',
        sessionId,
      };

    } catch (error) {
      this.logger.error(`Failed to process audio upload: ${error.message}`, error.stack);
      
      // Clean up the uploaded file on error
      if (file && file.path) {
        try {
          const fs = require('fs');
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          this.logger.error(`Failed to cleanup uploaded file: ${cleanupError.message}`);
        }
      }

      throw new HttpException(
        error.message || 'Failed to process audio file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('save-recording')
  async saveRecording(@Body() body: { audioData: string; sampleCount: number }) {
    try {
      this.logger.log(`Saving recorded audio: ${body.sampleCount} samples`);

      if (!body.audioData) {
        throw new HttpException('No audio data provided', HttpStatus.BAD_REQUEST);
      }

      // Convert base64 to buffer
      const audioBuffer = Buffer.from(body.audioData, 'base64');
      
      // Create recordings directory if it doesn't exist
      const fs = require('fs');
      const recordingsDir = join(process.cwd(), 'recordings');
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
      }
      
      // Save as test.wav in recordings directory
      const filepath = join(recordingsDir, 'test.wav');
      
      // Write the WAV file
      writeFileSync(filepath, audioBuffer);
      
      this.logger.log(`Recording saved successfully: ${filepath} (${audioBuffer.length} bytes)`);

      return {
        success: true,
        message: 'Recording saved successfully',
        filepath,
        size: audioBuffer.length,
        sampleCount: body.sampleCount
      };

    } catch (error) {
      this.logger.error(`Failed to save recording: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to save recording',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
