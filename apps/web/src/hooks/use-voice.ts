import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voce tramite le API del browser (Web Speech): riconoscimento vocale per
 * dettare le risposte e sintesi vocale per far parlare il Prof. AI.
 * Gratuito e senza chiavi: funziona al meglio su Chrome/Edge.
 */

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): { stt: boolean; tts: boolean } {
  return {
    stt: !!getRecognitionCtor(),
    tts: typeof window !== "undefined" && "speechSynthesis" in window,
  };
}

export function useSpeechToText(onFinalTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callbackRef = useRef(onFinalTranscript);
  callbackRef.current = onFinalTranscript;

  const supported = !!getRecognitionCtor();

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    // Ferma l'eventuale lettura in corso: il microfono la capterebbe.
    window.speechSynthesis?.cancel();

    const recognition = new Ctor();
    recognition.lang = "it-IT";
    recognition.interimResults = true;
    recognition.continuous = true;

    let finalText = "";

    recognition.onresult = (event: any) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interimText += chunk;
      }
      setInterim(interimText);
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
      const text = finalText.trim();
      if (text) callbackRef.current(text);
    };

    recognition.onerror = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, []);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, interim, start, stop };
}

function pickItalianVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return (
    voices.find((v) => v.lang === "it-IT" && /google|premium|enhanced/i.test(v.name)) ??
    voices.find((v) => v.lang === "it-IT") ??
    voices.find((v) => v.lang.startsWith("it")) ??
    null
  );
}

export function useTextToSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Su Chrome le voci arrivano in modo asincrono: questo le "scalda".
  useEffect(() => {
    if (!supported) return;
    const warm = () => window.speechSynthesis.getVoices();
    warm();
    window.speechSynthesis.addEventListener?.("voiceschanged", warm);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", warm);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!supported || !text.trim()) {
        onEnd?.();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "it-IT";
      const voice = pickItalianVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = 1.02;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        setSpeaking(false);
        onEnd?.();
      };
      utterance.onerror = () => {
        setSpeaking(false);
        onEnd?.();
      };
      window.speechSynthesis.speak(utterance);
    },
    [supported],
  );

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { supported, speaking, speak, stopSpeaking };
}
