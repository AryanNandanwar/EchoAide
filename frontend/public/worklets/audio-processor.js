class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2000; // 125ms at 16kHz
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.isRecording = false;
    this.recordedChunks = []; // Store recorded audio chunks
    this.totalSamples = 0; // Track total samples for WAV header
    
    this.port.onmessage = (event) => {
      console.log(`📨 AudioProcessor: Received message:`, event.data.type);
      if (event.data.type === 'start') {
        console.log(`▶️ AudioProcessor: Starting recording, resetting buffer`);
        this.isRecording = true;
        this.bufferIndex = 0;
        this.recordedChunks = []; // Clear previous recordings
        this.totalSamples = 0;
      } else if (event.data.type === 'stop') {
        console.log(`⏹️ AudioProcessor: Stopping recording`);
        this.isRecording = false;
        // Send any remaining data
        if (this.bufferIndex > 0) {
          console.log(`📤 AudioProcessor: Sending remaining ${this.bufferIndex} samples`);
          this.sendBuffer();
        } else {
          console.log(`⚠️ AudioProcessor: No remaining samples to send`);
        }
        // Send complete recording for saving
        this.sendCompleteRecording();
      } else if (event.data.type === 'save_recording') {
        console.log(`💾 AudioProcessor: Request to save recording`);
        this.sendCompleteRecording();
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (!input || !input.length || !this.isRecording) {
      return true;
    }

    const inputChannel = input[0];
    
    // Log audio processing
    if (inputChannel.length > 0) {
      console.log(`🎵 AudioProcessor: Processing ${inputChannel.length} audio samples, buffer index: ${this.bufferIndex}/${this.bufferSize}`);
    }
    
    // Process each sample
    for (let i = 0; i < inputChannel.length; i++) {
      this.inputBuffer[this.bufferIndex] = inputChannel[i];
      this.bufferIndex++;
      
      // When buffer is full, send it
      if (this.bufferIndex >= this.bufferSize) {
        console.log(`📤 AudioProcessor: Buffer full, sending audio chunk`);
        this.sendBuffer();
        this.bufferIndex = 0;
      }
    }
    
    return true;
  }

  sendBuffer() {
    if (this.bufferIndex === 0) {
      console.log(`⚠️ AudioProcessor: sendBuffer called but buffer is empty, skipping`);
      return;
    }
    
    console.log(`🔧 AudioProcessor: Converting ${this.bufferIndex} samples to PCM format`);
    
    // Convert Float32Array to Int16Array (16-bit PCM)
    const int16Buffer = new Int16Array(this.bufferIndex);
    for (let i = 0; i < this.bufferIndex; i++) {
      // Clamp and convert to 16-bit integer
      const sample = Math.max(-1, Math.min(1, this.inputBuffer[i]));
      int16Buffer[i] = sample * 0x7FFF;
    }
    
    // Store chunk for saving
    this.recordedChunks.push(new Int16Array(int16Buffer));
    this.totalSamples += this.bufferIndex;
    
    // Create WAV header for this chunk
    const wavHeader = this.createWavHeader(this.bufferIndex);
    
    // Combine header and audio data
    const wavFile = new Uint8Array(wavHeader.length + int16Buffer.byteLength);
    wavFile.set(wavHeader, 0);
    wavFile.set(new Uint8Array(int16Buffer.buffer), wavHeader.length);
    
    console.log(`🎵 AudioProcessor: Creating chunk with WAV headers`);
    console.log(`✅ AudioProcessor: Chunk created with ${wavFile.length} bytes (${wavHeader.length} header + ${int16Buffer.byteLength} audio)`);
    
    // Encode to Base64
    const base64String = this.arrayBufferToBase64(wavFile.buffer);
    
    console.log(`📡 AudioProcessor: Sending Base64 WAV audio (${base64String.length} chars) to main thread`);
    
    // Send the audio chunk to the main thread as Base64 with WAV headers
    this.port.postMessage({
      type: 'audio_chunk',
      data: base64String,
      timestamp: Date.now()
    });
  }

  sendCompleteRecording() {
    if (this.recordedChunks.length === 0) {
      console.log(`⚠️ AudioProcessor: No recorded chunks to save`);
      return;
    }

    console.log(`💾 AudioProcessor: Creating complete WAV file from ${this.recordedChunks.length} chunks`);
    
    // Combine all chunks into a single Int16Array
    const totalLength = this.totalSamples;
    const combinedBuffer = new Int16Array(totalLength);
    let offset = 0;
    
    for (const chunk of this.recordedChunks) {
      combinedBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Create WAV header
    const wavHeader = this.createWavHeader(combinedBuffer.length);
    
    // Combine header and audio data
    const wavFile = new Uint8Array(wavHeader.length + combinedBuffer.byteLength);
    wavFile.set(wavHeader, 0);
    wavFile.set(new Uint8Array(combinedBuffer.buffer), wavHeader.length);
    
    // Convert to Base64
    const wavBase64 = this.arrayBufferToBase64(wavFile.buffer);
    
    console.log(`✅ AudioProcessor: Created WAV file with ${wavFile.length} bytes`);
    
    // Send complete recording to main thread
    this.port.postMessage({
      type: 'complete_recording',
      data: wavBase64,
      timestamp: Date.now(),
      sampleCount: totalLength
    });
  }

  createWavHeader(dataLength) {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = dataLength * 2; // 16-bit samples
    
    // RIFF chunk descriptor
    view.setUint32(0, 0x46464952, true); // "RIFF"
    view.setUint32(4, 36 + dataSize, true); // Chunk size
    view.setUint32(8, 0x45564157, true); // "WAVE"
    
    // fmt subchunk
    view.setUint32(12, 0x20746d66, true); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1 size
    view.setUint16(20, 1, true); // Audio format (PCM)
    view.setUint16(22, numChannels, true); // Number of channels
    view.setUint32(24, sampleRate, true); // Sample rate
    view.setUint32(28, byteRate, true); // Byte rate
    view.setUint16(32, blockAlign, true); // Block align
    view.setUint16(34, bitsPerSample, true); // Bits per sample
    
    // data subchunk
    view.setUint32(36, 0x61746164, true); // "data"
    view.setUint32(40, dataSize, true); // Data size
    
    return new Uint8Array(header);
  }

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let base64 = '';
    let i = 0;
    
    while (i < bytes.length) {
      const a = bytes[i++];
      const b = i < bytes.length ? bytes[i++] : 0;
      const c = i < bytes.length ? bytes[i++] : 0;
      
      const bitmap = (a << 16) | (b << 8) | c;
      
      base64 += chars.charAt((bitmap >> 18) & 63);
      base64 += chars.charAt((bitmap >> 12) & 63);
      base64 += i - 2 < bytes.length ? chars.charAt((bitmap >> 6) & 63) : '=';
      base64 += i - 1 < bytes.length ? chars.charAt(bitmap & 63) : '=';
    }
    
    return base64;
  }

}

registerProcessor('audio-processor', AudioProcessor);
