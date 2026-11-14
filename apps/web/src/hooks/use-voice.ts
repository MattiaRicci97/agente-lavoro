import { useCallback, useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/native";

/**
 * Voce per dettare le risposte e far parlare il Prof. AI.
 *  - Nel browser: API Web Speech (gratuite, al meglio su Chrome/Edge).
 *  - Nell'app per telefono: riconoscimento e sintesi vocale del sistema
 *    (Android/iOS), perche' dentro le app le API del browser non ci sono.
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
  if (isNativeApp) return { stt: true, tts: true };
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

  const supported = isNativeApp || !!getRecognitionCtor();
  // Nell'app: ultimo testo riconosciuto, consegnato quando l'ascolto si ferma.
  const nativeTextRef = useRef("");

  const stop = useCallback(() => {
    if (isNativeApp) {
      void import("@capacitor-community/speech-recognition").then(({ SpeechRecognition }) => SpeechRecognition.stop());
      return;
    }
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (isNativeApp) {
      void startNative();
      return;
    }
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

  const startNative = useCallback(async () => {
    const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
    const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
    await TextToSpeech.stop().catch(() => undefined);
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") return;

    await SpeechRecognition.removeAllListeners();
    nativeTextRef.current = "";
    await SpeechRecognition.addListener("partialResults", (data: { matches?: string[] }) => {
      const text = data.matches?.[0] ?? "";
      nativeTextRef.current = text;
      setInterim(text);
    });
    await SpeechRecognition.addListener("listeningState", (data: { status: "started" | "stopped" }) => {
      if (data.status !== "stopped") return;
      setListening(false);
      setInterim("");
      const text = nativeTextRef.current.trim();
      nativeTextRef.current = "";
      if (text) callbackRef.current(text);
    });
    setListening(true);
    try {
      await SpeechRecognition.start({ language: "it-IT", partialResults: true, popup: false, maxResults: 1 });
    } catch {
      setListening(false);
      setInterim("");
    }
  }, []);

  useEffect(
    () => () => {
      if (isNativeApp) {
        void import("@capacitor-community/speech-recognition").then(({ SpeechRecognition }) => {
          void SpeechRecognition.stop().catch(() => undefined);
          void SpeechRecognition.removeAllListeners();
        });
        return;
      }
      recognitionRef.current?.abort();
    },
    [],
  );

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
  const supported = isNativeApp || (typeof window !== "undefined" && "speechSynthesis" in window);

  // Su Chrome le voci arrivano in modo asincrono: questo le "scalda".
  useEffect(() => {
    if (!supported || isNativeApp) return;
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
      if (isNativeApp) {
        void (async () => {
          const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
          await TextToSpeech.stop().catch(() => undefined);
          setSpeaking(true);
          try {
            // La promessa si risolve a fine lettura.
            await TextToSpeech.speak({ text, lang: "it-IT", rate: 1.0 });
          } catch {
            // Voce italiana non installata o lettura interrotta: si prosegue in silenzio.
          } finally {
            setSpeaking(false);
            onEnd?.();
          }
        })();
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
    if (isNativeApp) {
      void import("@capacitor-community/text-to-speech").then(({ TextToSpeech }) => TextToSpeech.stop().catch(() => undefined));
      setSpeaking(false);
      return;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { supported, speaking, speak, stopSpeaking };
}
