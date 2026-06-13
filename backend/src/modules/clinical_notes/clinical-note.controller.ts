// src/clinical_notes/modules/clinical-notes/clinical-notes.controller.ts
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  Res,
} from '@nestjs/common';
import { type Response } from 'express';
import { ClinicalNotesService } from './clinical-notes.service';
import { PdfService } from './pdf.service';
import { CreateClinicalNoteDto } from './dto/clinical-note.dto';
import { UpdateClinicalNoteDto } from './dto/update-clinical-note.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('clinical-notes')
@UseGuards(AuthGuard('jwt'))
export class ClinicalNotesController {
  constructor(
    private readonly clinicalNotesService: ClinicalNotesService,
    private readonly pdfService: PdfService
  ) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateClinicalNoteDto) {
    this.ensureDoctor(req);
    const doctorId = req.user.id; // <-- depends on your JWT payload
    return this.clinicalNotesService.create(dto, doctorId);
  }

  @Get()
  async findAll(@Req() req: any, @Query('status') status?: string) {
    this.ensureDoctor(req);
    const doctorId = req.user.id;
    return this.clinicalNotesService.findAllForDoctor(doctorId, status);
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    this.ensureDoctor(req);
    const doctorId = req.user.id;
    return this.clinicalNotesService.findOneForDoctor(doctorId, id);
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateClinicalNoteDto,
  ) {
    this.ensureDoctor(req);
    const doctorId = req.user.id;
    return this.clinicalNotesService.updateForDoctor(id, dto, doctorId);
  }

  @Delete(':id')
  async remove(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    this.ensureDoctor(req);
    const doctorId = req.user.id;
    await this.clinicalNotesService.delete(id, doctorId);
    return { message: 'Clinical note deleted successfully' };
  }

  @Get(':id/pdf')
  async generatePdf(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      this.ensureDoctor(req);
      const doctorId = req.user.id;
      console.log(`Generating PDF for clinical note ${id} for doctor ${doctorId}`);
      
      const clinicalNote = await this.clinicalNotesService.findOneForDoctor(doctorId, id);
      console.log('Retrieved clinical note:', JSON.stringify(clinicalNote, null, 2));
      
      const pdfBuffer = await this.pdfService.generateClinicalNotePdf(clinicalNote);
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="clinical-note-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      
      res.end(pdfBuffer);
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    }
  }

  @Get('patient/:patientId/count')
  async getNotesCountForPatient(
    @Req() req: any,
    @Param('patientId') patientId: string,
  ) {
    this.ensureDoctor(req);
    const doctorId = req.user.id;
    return this.clinicalNotesService.getNotesCountForPatient(doctorId, patientId);
  }

  @Get('patient/:patientId/summary')
  async getNotesSummaryForPatient(
    @Req() req: any,
    @Param('patientId') patientId: string,
  ) {
    this.ensureDoctor(req);
    const doctorId = req.user.id;
    return this.clinicalNotesService.getNotesSummaryForPatient(doctorId, patientId);
  }

  private ensureDoctor(req: any) {
    if (req.user?.role !== 'doctor') {
      throw new ForbiddenException('Only doctors can access clinical notes');
    }
  }
}
