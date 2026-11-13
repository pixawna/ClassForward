"""Local Piper narration: JSON on stdin, MP3 + measured sentence spans on stdout."""
import base64
import io
import json
import re
import subprocess
import sys
import textwrap
import wave
from piper import PiperVoice


def narrate(request):
    text = request["text"].strip()
    if not text or len(text) > 12000:
        raise ValueError("Narration must contain between 1 and 12000 characters.")
    voice = PiperVoice.load(request["model"])
    sample_rate = voice.config.sample_rate
    output = io.BytesIO()
    spans = []
    frames = 0
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for sentence in re.split(r"(?<=[.!?])\s+", text):
            start = frames / sample_rate
            for chunk in voice.synthesize(sentence):
                pcm = chunk.audio_int16_bytes
                wav.writeframesraw(pcm)
                frames += len(pcm) // 2
            # These are measured sentence spans, not estimated word timestamps.
            if frames / sample_rate > start:
                spans.append({"text": textwrap.fill(sentence, width=48), "start": start, "end": frames / sample_rate})
    if not frames:
        raise ValueError("Piper produced no audio.")
    result = subprocess.run(
        [request["ffmpeg"], "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "mp3", "-b:a", "128k", "pipe:1"],
        input=output.getvalue(), capture_output=True, check=True, timeout=60,
    )
    return {"audio_base64": base64.b64encode(result.stdout).decode("ascii"), "words": spans, "seconds": frames / sample_rate}


if __name__ == "__main__":
    try:
        print(json.dumps(narrate(json.load(sys.stdin))))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
