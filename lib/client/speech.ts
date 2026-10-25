"use client";

// Live lecture transcription with the browser's own speech recognition
// (Chrome, Edge, Safari). Nothing is recorded or uploaded by Mullwell.

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canTranscribe = () => ctor() !== null;

/** Starts listening; `onText` gets the final transcript so far plus the words still being heard. */
export function startTranscribing(onText: (finalText: string, interim: string) => void, onError: (message: string) => void): () => void {
  const Ctor = ctor();
  if (!Ctor) {
    onError("This browser can't transcribe speech. Try Chrome, Edge or Safari.");
    return () => {};
  }
  let finalText = "";
  let stopped = false;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || "en-US";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += `${r[0].transcript.trim()} `;
      else interim += r[0].transcript;
    }
    onText(finalText, interim);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed") onError("Microphone access was blocked. Allow it in your browser's site settings.");
    else if (e.error !== "no-speech" && e.error !== "aborted") onError(`Transcription stopped (${e.error}).`);
  };
  // Recognition ends on its own after silence; keep going until stopped.
  rec.onend = () => {
    if (!stopped) rec.start();
  };
  rec.start();
  return () => {
    stopped = true;
    rec.stop();
  };
}
