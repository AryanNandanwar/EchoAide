import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class PdfService {
  async generateClinicalNotePdf(clinicalNote: any): Promise<Buffer> {
    let browser;
    try {
      console.log('Launching Puppeteer browser...');
      const launchOptions: any = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      };
      
      // Use system Chrome if available (for Docker/production)
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        launchOptions.args.push('--disable-dev-shm-usage');
      }
      
      browser = await puppeteer.launch(launchOptions);
      console.log('Puppeteer browser launched successfully');
      
      const page = await browser.newPage();
      console.log('New page created successfully');
      
      // Generate HTML content for the clinical note
      const htmlContent = this.generateClinicalNoteHtml(clinicalNote);
      console.log('HTML content generated, length:', htmlContent.length);
      
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0'
      });
      console.log('Page content set successfully');
      
      // Generate PDF with single page formatting
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          bottom: '20px',
          left: '20px',
          right: '20px'
        },
        preferCSSPageSize: true
      });
      console.log('PDF generated successfully, buffer size:', pdfBuffer.length);
      
      return pdfBuffer;
    } catch (error) {
      console.error('Error in PDF generation:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private generateClinicalNoteHtml(clinicalNote: any): string {
    const patientDetails = clinicalNote.patientDetails ? 
      (typeof clinicalNote.patientDetails === 'string' ? 
        JSON.parse(clinicalNote.patientDetails) : clinicalNote.patientDetails) : {};
    
    const medicalHistory = clinicalNote.medicalHistory ? 
      (typeof clinicalNote.medicalHistory === 'string' ? 
        JSON.parse(clinicalNote.medicalHistory) : clinicalNote.medicalHistory) : [];
    
    const problemsFaced = clinicalNote.problemsFaced ? 
      (typeof clinicalNote.problemsFaced === 'string' ? 
        JSON.parse(clinicalNote.problemsFaced) : clinicalNote.problemsFaced) : [];
    
    const doctorInstructions = clinicalNote.doctorInstructions ? 
      (typeof clinicalNote.doctorInstructions === 'string' ? 
        JSON.parse(clinicalNote.doctorInstructions) : clinicalNote.doctorInstructions) : [];
    
    const medicationPrescribed = clinicalNote.medicationPrescribed ? 
      (typeof clinicalNote.medicationPrescribed === 'string' ? 
        JSON.parse(clinicalNote.medicationPrescribed) : clinicalNote.medicationPrescribed) : [];

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Clinical Note</title>
    <style>
        @page {
            size: A4;
            margin: 20px;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 12px;
            line-height: 1.4;
            color: #333;
            margin: 0;
            padding: 0;
        }
        
        .header {
            text-align: center;
            border-bottom: 2px solid #2c3e50;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        
        .header h1 {
            margin: 0;
            color: #2c3e50;
            font-size: 24px;
            font-weight: 600;
        }
        
        .section {
            margin-bottom: 20px;
            break-inside: avoid;
        }
        
        .section-title {
            font-weight: 600;
            color: #2c3e50;
            font-size: 14px;
            margin-bottom: 8px;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 4px;
        }
        
        .patient-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .detail-item {
            margin-bottom: 5px;
        }
        
        .detail-label {
            font-weight: 600;
            color: #555;
        }
        
        .detail-value {
            color: #333;
        }
        
        .list-item {
            margin-bottom: 5px;
            padding-left: 15px;
            position: relative;
        }
        
        .list-item:before {
            content: "•";
            position: absolute;
            left: 0;
            color: #2c3e50;
        }
        
        .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #e0e0e0;
            font-size: 10px;
            color: #666;
            text-align: center;
        }
        
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>CLINICAL NOTE</h1>
    </div>
    
    <div class="section">
        <div class="section-title">PATIENT DETAILS</div>
        <div class="patient-details">
            ${Object.entries(patientDetails).map(([key, value]) => `
                <div class="detail-item">
                    <span class="detail-label">${key}:</span> 
                    <span class="detail-value">${value}</span>
                </div>
            `).join('')}
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">MEDICAL HISTORY</div>
        ${(Array.isArray(medicalHistory) ? medicalHistory : [medicalHistory]).map(item => 
            `<div class="list-item">${item}</div>`
        ).join('')}
    </div>
    
    <div class="section">
        <div class="section-title">PROBLEMS FACED</div>
        ${(Array.isArray(problemsFaced) ? problemsFaced : [problemsFaced]).map(item => 
            `<div class="list-item">${item}</div>`
        ).join('')}
    </div>
    
    <div class="section">
        <div class="section-title">DOCTOR INSTRUCTIONS</div>
        ${(Array.isArray(doctorInstructions) ? doctorInstructions : [doctorInstructions]).map(item => 
            `<div class="list-item">${item}</div>`
        ).join('')}
    </div>
    
    <div class="section">
        <div class="section-title">MEDICATION PRESCRIBED</div>
        ${(Array.isArray(medicationPrescribed) ? medicationPrescribed : [medicationPrescribed]).map(item => 
            `<div class="list-item">${item}</div>`
        ).join('')}
    </div>
    
    <div class="footer">
        Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
    </div>
</body>
</html>`;
  }
}
