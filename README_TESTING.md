# Audio Recording Testing Setup

This setup allows you to record audio through the web interface and test it with the SarvamAI Python SDK.

## How to Use

### 1. Record Audio
1. Start the frontend and backend servers
2. Log in to the application
3. Click "Start Recording" in the audio controls
4. Speak clearly into your microphone
5. Click "Stop Recording" when finished

### 2. Save Recording for Testing
After stopping recording, you'll see two new buttons:
- **Download Recording**: Downloads the audio as a WAV file to your computer
- **Save for Test**: Saves the recording to `recorded_audio.wav` in the project root for Python testing

### 3. Test with Python SDK
Once you've saved the recording using "Save for Test", run:

```bash
python test_streaming.py
```

This will:
- Check if `recorded_audio.wav` exists
- Load the audio file and convert to base64
- Send it to SarvamAI for transcription
- Display the transcription result

## File Structure

```
/home/aryan/doctorscribe/
├── test_streaming.py              # Python test script
├── recorded_audio.wav            # Saved recording (created by "Save for Test")
├── frontend/
│   ├── public/worklets/
│   │   └── audio-processor.js   # Enhanced audio processor with saving capability
│   └── src/
│       ├── hooks/
│       │   └── use-streaming-transcription.ts
│       └── components/
│           └── transcribeBar.tsx # UI with download/save buttons
└── backend/
    └── src/modules/streaming/
        └── audio-upload.controller.ts # Backend endpoint for saving recordings
```

## Key Features

### Audio Processor Enhancements
- **Chunk Storage**: Records and stores audio chunks during recording
- **WAV File Generation**: Combines chunks into a proper WAV file with headers
- **Base64 Encoding**: Sends complete recording as base64 for easy transfer

### Frontend Features
- **Download Button**: Direct download of recorded audio
- **Save for Test Button**: Saves recording to project root for Python testing
- **Real-time Feedback**: Console logs showing recording status and file operations

### Backend Endpoint
- **POST /upload-audio/save-recording**: Saves base64 audio data as WAV file
- **Authentication**: Requires valid JWT token
- **File Location**: Saves to project root as `recorded_audio.wav`

## Testing Workflow

1. **Record**: Use the web interface to record audio
2. **Save**: Click "Save for Test" to save the recording
3. **Test**: Run `python test_streaming.py` to test transcription
4. **Iterate**: Record new audio and test again

## Troubleshooting

### Recording Issues
- Ensure microphone permissions are granted
- Check browser console for audio processing logs
- Verify WebSocket connection is established

### Python Test Issues
- Ensure `recorded_audio.wav` exists in project root
- Check SarvamAI API key is valid
- Verify internet connection for API calls

### Backend Issues
- Check backend logs for save operations
- Verify uploads directory exists and is writable
- Ensure authentication headers are valid

## Audio Specifications

- **Sample Rate**: 16kHz
- **Channels**: Mono (1 channel)
- **Bit Depth**: 16-bit PCM
- **Format**: WAV with proper headers

This setup provides a complete end-to-end testing pipeline for audio transcription with the SarvamAI SDK.
