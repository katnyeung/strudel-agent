import fs from 'node:fs';
import path from 'node:path';

const SAMPLES_DIR = path.join('web', 'samples');

export async function generateVocal(word: string): Promise<{ url: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel default

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: word,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.3, similarity_boost: 0.7 },
    }),
  });

  if (!res.ok) throw new Error(`ElevenLabs API error: ${res.status} ${res.statusText}`);

  // Ensure samples dir exists
  if (!fs.existsSync(SAMPLES_DIR)) {
    fs.mkdirSync(SAMPLES_DIR, { recursive: true });
  }

  const ts = Date.now();
  const filename = `vocal-${ts}.mp3`;
  const filePath = path.join(SAMPLES_DIR, filename);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const url = `/samples/${filename}`;
  console.log(`[vocal] Generated "${word}" → ${url} (${buffer.length} bytes)`);
  return { url };
}

export function cleanupVocal(sampleUrl: string): void {
  const filePath = path.join('web', sampleUrl);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[vocal] Cleaned up ${sampleUrl}`);
    }
  } catch (e: any) {
    console.error(`[vocal] Cleanup failed for ${sampleUrl}:`, e.message);
  }
}
