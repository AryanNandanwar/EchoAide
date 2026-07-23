import { PdfService } from './pdf.service';

const mockPdf = jest.fn();
const mockSetContent = jest.fn();
const mockNewPage = jest.fn();
const mockBrowserClose = jest.fn();
const mockLaunch = jest.fn();

jest.mock('puppeteer', () => ({
  launch: (...args: unknown[]) => mockLaunch(...args),
}));

describe('PdfService', () => {
  let service: PdfService;
  const originalExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PUPPETEER_EXECUTABLE_PATH;

    mockPdf.mockResolvedValue(Buffer.from('%PDF-1.4 mock'));
    mockSetContent.mockResolvedValue(undefined);
    mockNewPage.mockResolvedValue({
      setContent: mockSetContent,
      pdf: mockPdf,
    });
    mockBrowserClose.mockResolvedValue(undefined);
    mockLaunch.mockResolvedValue({
      newPage: mockNewPage,
      close: mockBrowserClose,
    });

    service = new PdfService();
  });

  afterAll(() => {
    if (originalExecutablePath) {
      process.env.PUPPETEER_EXECUTABLE_PATH = originalExecutablePath;
    }
  });

  function normalizeHtml(html: string): string {
    return html.replace(/Generated on .*?<\/div>/s, 'Generated on <fixed-date></div>');
  }

  describe('generateClinicalNoteHtml', () => {
    it('renders patient details and clinical sections from JSON strings', () => {
      const html = (service as any).generateClinicalNoteHtml({
        patientDetails: JSON.stringify({ name: 'Asha Rao', age: '41' }),
        medicalHistory: JSON.stringify(['Diabetes', 'Hypertension']),
        problemsFaced: JSON.stringify(['Headache']),
        doctorInstructions: JSON.stringify(['Rest and hydrate']),
        medicationPrescribed: JSON.stringify(['Paracetamol 500mg']),
      });

      expect(html).toContain('CLINICAL NOTE');
      expect(html).toContain('Asha Rao');
      expect(html).toContain('Diabetes');
      expect(html).toContain('Headache');
      expect(html).toContain('Rest and hydrate');
      expect(html).toContain('Paracetamol 500mg');
    });

    it('handles already-parsed object fields', () => {
      const html = (service as any).generateClinicalNoteHtml({
        patientDetails: { name: 'John Doe' },
        medicalHistory: ['Asthma'],
        problemsFaced: ['Wheezing'],
        doctorInstructions: ['Use inhaler'],
        medicationPrescribed: ['Salbutamol'],
      });

      expect(html).toContain('John Doe');
      expect(html).toContain('Asthma');
      expect(html).toContain('Wheezing');
    });

    it('matches the clinical note HTML snapshot', () => {
      const html = normalizeHtml(
        (service as any).generateClinicalNoteHtml({
          patientDetails: { name: 'Snapshot Patient', age: '32' },
          medicalHistory: ['Asthma'],
          problemsFaced: ['Wheezing at night'],
          doctorInstructions: ['Use inhaler before bed'],
          medicationPrescribed: ['Salbutamol'],
        }),
      );

      expect(html).toMatchSnapshot();
    });
  });

  describe('generateClinicalNotePdf', () => {
    it('launches Puppeteer, renders HTML, and returns the PDF buffer', async () => {
      const note = {
        id: 'note-pdf-1',
        patientDetails: JSON.stringify({ name: 'PDF Patient' }),
        medicalHistory: JSON.stringify(['None']),
        problemsFaced: JSON.stringify(['Cough']),
        doctorInstructions: JSON.stringify(['Rest']),
        medicationPrescribed: JSON.stringify(['Paracetamol']),
      };

      const buffer = await service.generateClinicalNotePdf(note);

      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          executablePath: '/usr/bin/chromium-browser',
          args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
        }),
      );
      expect(mockSetContent).toHaveBeenCalledWith(
        expect.stringContaining('PDF Patient'),
        { waitUntil: 'networkidle0' },
      );
      expect(mockPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        }),
      );
      expect(buffer.equals(Buffer.from('%PDF-1.4 mock'))).toBe(true);
      expect(mockBrowserClose).toHaveBeenCalled();
    });

    it('uses PUPPETEER_EXECUTABLE_PATH when provided', async () => {
      process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/custom-chromium';

      await service.generateClinicalNotePdf({
        patientDetails: { name: 'Custom Chromium' },
        medicalHistory: ['None'],
        problemsFaced: ['Cough'],
        doctorInstructions: ['Rest'],
        medicationPrescribed: ['None'],
      });

      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: '/usr/bin/custom-chromium',
          args: expect.arrayContaining(['--disable-dev-shm-usage']),
        }),
      );
    });

    it('closes the browser and wraps failures when PDF generation throws', async () => {
      mockPdf.mockRejectedValueOnce(new Error('page.pdf failed'));

      await expect(
        service.generateClinicalNotePdf({
          patientDetails: { name: 'Failure Case' },
          medicalHistory: ['None'],
          problemsFaced: ['Cough'],
          doctorInstructions: ['Rest'],
          medicationPrescribed: ['None'],
        }),
      ).rejects.toThrow('PDF generation failed: page.pdf failed');

      expect(mockBrowserClose).toHaveBeenCalled();
    });
  });

  const runPdfE2E = process.env.RUN_PDF_E2E === 'true';
  (runPdfE2E ? describe : describe.skip)('generateClinicalNotePdf E2E (headless Chromium)', () => {
    it('generates a non-empty PDF buffer from real HTML rendering', async () => {
      jest.unmock('puppeteer');
      const e2eService = new PdfService();

      const buffer = await e2eService.generateClinicalNotePdf({
        patientDetails: { name: 'E2E Patient' },
        medicalHistory: ['None'],
        problemsFaced: ['Sore throat'],
        doctorInstructions: ['Warm fluids'],
        medicationPrescribed: ['Paracetamol'],
      });

      expect(buffer.length).toBeGreaterThan(100);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    }, 60000);
  });
});
