# Local narration with Piper

ClassForward can narrate lessons locally using [Piper](https://github.com/OHF-Voice/piper1-gpl). No voice API key is needed and lesson text stays on this computer during speech synthesis.

Install once from the repository root:

```sh
python3 -m venv voice/.venv
voice/.venv/bin/python -m pip install -r voice/requirements.txt
voice/.venv/bin/python -m piper.download_voices --download-dir voice/models en_US-ljspeech-high
```

Set `TTS_PROVIDER=piper` in `.env.local` and restart the development server. `PIPER_PYTHON` and `PIPER_MODEL` optionally select a different Python executable or downloaded `.onnx` voice. Keep its matching `.onnx.json` beside it. Model files and the virtual environment are ignored by Git.

The installed English voice is `en_US-ljspeech-high`. Its [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD) identifies the LJ Speech dataset as public domain. Piper's engine is GPL-3.0; consult its license when redistributing it. Other voice models have their own model cards and licenses.

The Python worker produces real MP3 speech through the existing ffmpeg binary. Caption spans use measured sentence audio durations, rather than word-level forced alignment. Chapters use the rendered timeline. Cached recordings include the provider and model, so switching providers re-records narration.

To use the optional cloud voice again, set `TTS_PROVIDER=elevenlabs` and supply a valid `ELEVENLABS_API_KEY`.
