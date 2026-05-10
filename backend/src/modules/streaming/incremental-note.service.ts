import { Injectable, Logger } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import { sleep } from '../common/utils/sleep';
import { type ParsedNote } from '../sse/schemas/parsed-note.schema';

@Injectable()
export class IncrementalNoteService {
  private readonly logger = new Logger(IncrementalNoteService.name);
  private readonly bedrock: AWS.BedrockRuntime;
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;

  constructor() {
    // Initialize Bedrock client with proper credentials
    AWS.config.update({ 
      region: process.env.AWS_REGION || 'ap-south-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      // Ensure proper clock sync for signature validation
      correctClockSkew: true
    });
    this.bedrock = new AWS.BedrockRuntime();
    
    // Initialize rate limiting configuration from environment variables
    this.maxRetries = parseInt(process.env.BEDROCK_MAX_RETRIES || '5');
    this.baseDelay = parseInt(process.env.BEDROCK_BASE_DELAY || '2000');
    this.maxDelay = parseInt(process.env.BEDROCK_MAX_DELAY || '20000');
  }


  async generateFinalNote(fullTranscript: string): Promise<ParsedNote> {
    try {
      // Check if we have meaningful transcript content
      if (!fullTranscript || fullTranscript.trim().length === 0) {
        this.logger.warn('Empty transcript provided for final note generation');
        return this.getDefaultNoteStructure();
      }
      
      // Check if transcript is too short to be meaningful
      if (fullTranscript.trim().length < 10) {
        this.logger.warn('Transcript too short for meaningful note generation');
        return this.getDefaultNoteStructure();
      }

      const prompt = this.buildFinalPrompt(fullTranscript);
      const response = await this.callBedrock(prompt);
      
      return this.parseFinalResponse(response);
    } catch (error) {
      this.logger.error('Failed to generate final note:', error);
      return this.getDefaultNoteStructure();
    }
  }


  private buildFinalPrompt(fullTranscript: string): string {
    return `You are an expert medical scribe AI assistant. Your task is to analyze the following doctor-patient conversation transcript and generate a structured clinical note.

The transcript may contain speech recognition errors. Please:
1. Correct any obvious ASR (Automatic Speech Recognition) errors based on medical context
2. Extract and organize information into the following sections:
   - Patient Details (name, age, gender, contact information if mentioned)
   - Medical History (past conditions, surgeries, family history)
   - Problem Faced (chief complaint, symptoms, duration)
   - Findings (what the doctor finds during examination - physical exam results, observations, vitals)
   - Diagnosis (what the doctor diagnoses the patient with)
   - Investigations Advised (tests, labs, imaging studies the patient needs to get done)
   - Doctor Instructions (general advice, follow-up instructions, lifestyle recommendations - NOT test orders)
   - Medication Prescribed (drug name, dosage, frequency, duration)

IMPORTANT DISTINCTIONS:
- "Findings" should include physical examination results, vitals, observations made during examination
- "Investigations Advised" should include specific tests, labs, imaging studies that need to be done
- "Doctor Instructions" should only contain general advice, lifestyle recommendations, follow-up instructions - NOT test orders

If any section has no information available, use "Not mentioned" for that section.
Do not provide any disclaimer.

Conversation Transcript:
${fullTranscript}

Please provide the clinical note in the following JSON format:
{
  "patientDetails": "...",
  "medicalHistory": "...",
  "problemsFaced": "...",
  "findings": "...",
  "diagnosis": "...",
  "investigationsAdvised": "...",
  "doctorInstructions": "...",
  "medicationPrescribed": "..."
}`;
  }
  
  private async callBedrock(prompt: string): Promise<string> {

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const payload = {
          // Amazon Nova models use different format
          ...(process.env.BEDROCK_MODEL_ID?.includes('nova') ? {
            inferenceConfig: {
              maxNewTokens: 2048,
              temperature: 0.3,
            },
            input: {
              inputText: prompt,
            },
          } : {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 2048,
            temperature: 0.3,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        };

        const params = {
          modelId: process.env.BEDROCK_MODEL_ID || 'apac.anthropic.claude-3-5-sonnet-20241022-v2:0', // Make model configurable
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(payload),
        };

        const response = await this.bedrock.invokeModel(params).promise();
        const responseBody = JSON.parse(response.body.toString());
        
        
        // Parse response based on model type
        if (process.env.BEDROCK_MODEL_ID?.includes('nova')) {
          // Nova models have different response format
          return responseBody.results?.[0]?.outputText || responseBody.outputText || '';
        } else {
          // Anthropic models
          return responseBody.content[0].text;
        }
        
      } catch (error: any) {
        lastError = error;
        
        if (error.code === 'ThrottlingException' && attempt < this.maxRetries) {
          const delay = Math.min(
            this.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
            this.maxDelay
          );
          
          this.logger.warn(
            `AWS Bedrock throttled (attempt ${attempt + 1}/${this.maxRetries + 1}). ` +
            `Retrying in ${Math.round(delay)}ms...`
          );
          
          await sleep(delay);
        } else {
          throw error;
        }
      }
    }
    
    this.logger.error(
      `Failed to call Bedrock after ${this.maxRetries + 1} attempts. Last error:`,
      lastError || new Error('Unknown error')
    );
    throw lastError || new Error('Unknown error');
  }


  private parseFinalResponse(response: string): ParsedNote {
    // Define default sections once at the beginning
    const defaultSections: ParsedNote = {
      patientDetails: {},
      medicalHistory: ['Not mentioned'],
      problemFaced: 'Not mentioned',
      findings: ['Not mentioned'],
      diagnosis: ['Not mentioned'],
      investigationsAdvised: ['Not mentioned'],
      doctorInstructions: ['Not mentioned'],
      medicationPrescribed: ['Not mentioned'],
    };

    try {
      // Clean up response - remove any markdown formatting or extra text
      let cleanedResponse = response.trim();
      
      // Remove markdown code blocks if present
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }
      
      // Try to extract JSON from the response if it's mixed with text
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }
      
      // Fix common JSON formatting issues before parsing
      let sanitizedResponse = cleanedResponse;
      
      // Fix invalid property names that start with hyphens (common LLM output issue)
      sanitizedResponse = sanitizedResponse.replace(/"(-\s*[^"]+)":/g, (match, propName) => {
        // Remove hyphen and clean up the property name
        const cleanName = propName.replace(/^-\s*/, '').trim();
        return `"${cleanName}":`;
      });
      
      // Fix other common JSON issues
      sanitizedResponse = sanitizedResponse.replace(/,\s*}/g, '}'); // Remove trailing commas
      sanitizedResponse = sanitizedResponse.replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
      
      // Escape control characters in JSON string values
      sanitizedResponse = sanitizedResponse.replace(/"([^"]*)"/g, (match, content) => {
        // Escape newlines, tabs, and other control characters within string values
        const escaped = content
          .replace(/\\/g, '\\\\') // Escape backslashes first
          .replace(/"/g, '\\"') // Escape quotes
          .replace(/\n/g, '\\n') // Escape newlines
          .replace(/\r/g, '\\r') // Escape carriage returns
          .replace(/\t/g, '\\t'); // Escape tabs
        return `"${escaped}"`;
      });
      
      this.logger.debug('Sanitized JSON response:', sanitizedResponse);
      
      // Try to parse as JSON
      const note = JSON.parse(sanitizedResponse);
      
      this.logger.debug('Parsed note before array conversion:', note);

      // Convert and structure the note according to ParsedNote format
      const processedNote: ParsedNote = {
        patientDetails: {},
        medicalHistory: [],
        problemFaced: '',
        findings: [],
        diagnosis: [],
        investigationsAdvised: [],
        doctorInstructions: [],
        medicationPrescribed: [],
        raw: response,
      };

      // Process each field according to the expected format
      Object.keys(note).forEach(key => {
        const value = note[key];
        
        switch (key) {
          case 'patientDetails':
            if (typeof value === 'string') {
              // Try to parse patient details as key-value pairs
              if (value.includes(':') || value.includes('-')) {
                const details: Record<string, string> = {};
                const lines = value.split(/[,\n]/).map(line => line.trim());
                lines.forEach(line => {
                  if (line.includes(':')) {
                    const [k, v] = line.split(':').map(s => s.trim());
                    if (k && v) details[k] = v;
                  } else if (line.startsWith('-')) {
                    const cleanLine = line.replace(/^[-\s]+/, '').trim();
                    if (cleanLine) {
                      const parts = cleanLine.split(/\s+/);
                      if (parts.length >= 2) {
                        details[parts[0]] = parts.slice(1).join(' ');
                      }
                    }
                  }
                });
                processedNote.patientDetails = details;
              } else {
                processedNote.patientDetails = { info: value };
              }
            } else if (typeof value === 'object' && !Array.isArray(value)) {
              processedNote.patientDetails = value as Record<string, string>;
            }
            break;
            
          case 'problemFaced':
            if (Array.isArray(value)) {
              processedNote.problemFaced = value.join(', ');
            } else {
              processedNote.problemFaced = value as string;
            }
            break;
            
          case 'problemsFaced':
            // Handle the old field name
            if (Array.isArray(value)) {
              processedNote.problemFaced = value.join(', ');
            } else {
              processedNote.problemFaced = value as string;
            }
            break;
            
          case 'medicationPrescribed':
            // Handle complex medication objects
            if (Array.isArray(value)) {
              const medications = value.map(med => {
                if (typeof med === 'string') {
                  return med;
                } else if (typeof med === 'object' && med !== null) {
                  // Convert medication object to readable string
                  const parts: string[] = [];
                  if (med.name) parts.push(med.name);
                  if (med.dosage) parts.push(`(${med.dosage})`);
                  if (med.duration) parts.push(`for ${med.duration}`);
                  if (med.instructions) parts.push(`- ${med.instructions}`);
                  if (med.purpose) parts.push(`[${med.purpose}]`);
                  return parts.join(' ');
                }
                return String(med);
              });
              processedNote.medicationPrescribed = medications;
            } else if (typeof value === 'string') {
              processedNote.medicationPrescribed = [value];
            } else if (typeof value === 'object' && value !== null) {
              // Handle single medication object
              const med = value as any;
              const parts: string[] = [];
              if (med.name) parts.push(med.name);
              if (med.dosage) parts.push(`(${med.dosage})`);
              if (med.duration) parts.push(`for ${med.duration}`);
              if (med.instructions) parts.push(`- ${med.instructions}`);
              if (med.purpose) parts.push(`[${med.purpose}]`);
              processedNote.medicationPrescribed = [parts.join(' ')];
            }
            break;
            
          case 'findings':
            // Handle findings that can be either array or object
            if (Array.isArray(value)) {
              processedNote.findings = value;
            } else if (typeof value === 'object' && value !== null) {
              // Convert findings object to array of strings
              const findingStrings = Object.entries(value).map(([key, val]) => `${key}: ${val}`);
              processedNote.findings = findingStrings;
            } else if (typeof value === 'string') {
              processedNote.findings = [value];
            }
            break;
            
          default:
            // For other array fields (medicalHistory, diagnosis, etc.)
            if (Array.isArray(value)) {
              (processedNote as any)[key] = value;
            } else if (typeof value === 'string') {
              // Convert string to array for fields that should be arrays
              if (['medicalHistory', 'diagnosis', 'investigationsAdvised', 'doctorInstructions'].includes(key)) {
                (processedNote as any)[key] = [value];
              } else {
                (processedNote as any)[key] = value;
              }
            }
            break;
        }
      });

      this.logger.debug('Final processed note:', processedNote);
      return { ...defaultSections, ...processedNote };
    } catch (error) {
      this.logger.error('Failed to parse final response:', error);
      this.logger.debug('Original response:', response);
      
      // Check if the response contains meaningful content that isn't JSON
      if (response && response.trim().length > 0 && !response.includes('no conversation transcript')) {
        this.logger.warn('AI returned non-JSON response, this might indicate a prompt or model issue');
        
        // Try to extract some useful information from the non-JSON response
        const extractedInfo = this.extractInfoFromNonJsonResponse(response);
        if (extractedInfo) {
          this.logger.log('Extracted some information from non-JSON response');
          return { ...defaultSections, ...extractedInfo };
        }
      }
      
      // Fallback: return default structure
      return defaultSections;
    }
  }

  // Helper method to get default note structure
  private getDefaultNoteStructure(): ParsedNote {
    return {
      patientDetails: {},
      medicalHistory: ['Not mentioned'],
      problemFaced: 'Not mentioned',
      findings: ['Not mentioned'],
      diagnosis: ['Not mentioned'],
      investigationsAdvised: ['Not mentioned'],
      doctorInstructions: ['Not mentioned'],
      medicationPrescribed: ['Not mentioned'],
    };
  }

  private extractInfoFromNonJsonResponse(response: string): ParsedNote | null {
    try {
      // Simple extraction - look for key medical terms and categorize them
      const extracted: ParsedNote = {
        patientDetails: {},
        medicalHistory: [],
        problemFaced: '',
        findings: [],
        diagnosis: [],
        investigationsAdvised: [],
        doctorInstructions: [],
        medicationPrescribed: [],
        raw: response,
      };
      
      // Look for common medical symptoms
      const symptoms = ['fever', 'pain', 'swelling', 'headache', 'cough', 'cold', 'nausea', 'vomiting'];
      const foundSymptoms = symptoms.filter(symptom => 
        response.toLowerCase().includes(symptom)
      );
      
      if (foundSymptoms.length > 0) {
        extracted.problemFaced = foundSymptoms.join(', ');
      }
      
      // Look for medications
      const medicationKeywords = ['tablet', 'medicine', 'pill', 'dose', 'mg', 'take'];
      if (medicationKeywords.some(keyword => response.toLowerCase().includes(keyword))) {
        extracted.medicationPrescribed = ['Medication mentioned in transcript'];
      }
      
      // Look for pregnancy-related terms
      if (response.toLowerCase().includes('pregnan')) {
        extracted.medicalHistory = ['Pregnancy related'];
      }
      
      // Return null if no meaningful information extracted
      const hasMeaningfulContent = Object.keys(extracted).some(key => {
        const value = (extracted as any)[key];
        if (Array.isArray(value)) {
          return value.length > 0 && value[0] !== 'Not mentioned';
        }
        return value && value !== 'Not mentioned' && value !== '';
      });
      
      return hasMeaningfulContent ? extracted : null;
    } catch (error) {
      this.logger.warn('Failed to extract info from non-JSON response:', error);
      return null;
    }
  }

  
}
