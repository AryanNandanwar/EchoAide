from sarvamai import SarvamAI
import asyncio

client = SarvamAI(api_subscription_key="sk_pmqg5g87_qwUP0lssfndURKKaRiZJnE6f")

async def test():
    with open("test.wav", "rb") as f:
        audio_data = f.read()
    
    async with client.speech_to_text_streaming.connect(
        model="saaras:v3",
        mode="transcribe",
        language_code="unknown",
        high_vad_sensitivity=True
    ) as ws:
        await ws.transcribe(audio=audio_data)
        response = await ws.recv()
        print(response)

asyncio.run(test())
