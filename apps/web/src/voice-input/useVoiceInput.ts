import { useEffect, useRef, useState } from "react";
import {
  VoiceInputController,
  VOICE_RECORDING_LIMIT_SECONDS,
  createOpenRouterVoiceTranscriber,
  voiceInputBlocksSubmission,
  type VoiceInputState,
  type VoiceRecorder,
} from "@t3tools/client-runtime/voice-input";
import { readVoiceSettings, useVoiceSettings } from "./settings";

function readAudio(uri: string, signal: AbortSignal): Promise<{ data: string; format: string }> {
  return fetch(uri, { signal }).then(async (response) => {
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    const format = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    return { data: btoa(binary), format };
  });
}

export function useVoiceInput(input: {
  ownerKey: string;
  disabled: boolean;
  readText: () => string;
  readCursor: () => number;
  commitText: (text: string, cursor: number) => void;
}) {
  const settings = useVoiceSettings();
  const observed = useRef({ ownerKey: input.ownerKey, text: input.readText(), revision: 0 });
  const observe = () => {
    const text = input.readText();
    if (observed.current.ownerKey !== input.ownerKey || observed.current.text !== text) {
      observed.current = {
        ownerKey: input.ownerKey,
        text,
        revision: observed.current.revision + 1,
      };
    }
    return observed.current;
  };
  observe();
  const latest = useRef({ ...input, observe });
  latest.current = { ...input, observe };
  const [state, setState] = useState<VoiceInputState>({
    phase: "idle",
    error: null,
    errorAction: null,
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const controllerRef = useRef<VoiceInputController | null>(null);
  const clock = useRef({ elapsed: 0, resumedAt: 0 });
  if (!controllerRef.current) {
    let stream: MediaStream | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let uri: string | null = null;
    let chunks: Blob[] = [];
    let stopped: Promise<void> = Promise.resolve();
    const recorder: VoiceRecorder = {
      get uri() {
        return uri;
      },
      async prepareToRecordAsync() {
        if (!stream) throw new Error("Microphone unavailable.");
        const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(
          (type) => MediaRecorder.isTypeSupported(type),
        );
        if (!mimeType) throw new Error("This browser cannot record a supported audio format.");
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        chunks = [];
        uri = null;
        const current = mediaRecorder;
        stopped = new Promise<void>((resolve) => {
          current.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
          };
          current.onstop = () => {
            uri = URL.createObjectURL(new Blob(chunks, { type: current.mimeType }));
            chunks = [];
            resolve();
            void controllerRef.current?.interruptRecording(
              "Microphone recording was interrupted.",
              uri,
            );
          };
        });
        current.onerror = () => {
          void controllerRef.current?.interruptRecording("Microphone recording failed.");
        };
      },
      record() {
        clock.current = { elapsed: 0, resumedAt: performance.now() };
        setElapsedSeconds(0);
        mediaRecorder?.start(1000);
      },
      pause() {
        mediaRecorder?.pause();
        clock.current.elapsed += performance.now() - clock.current.resumedAt;
        stream?.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      },
      resume() {
        stream?.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        mediaRecorder?.resume();
        clock.current.resumedAt = performance.now();
      },
      async stop() {
        if (!mediaRecorder || mediaRecorder.state === "inactive") return;
        mediaRecorder.stop();
        await stopped;
      },
    };
    controllerRef.current = new VoiceInputController({
      recorder,
      getTranscriber: () => {
        const settings = readVoiceSettings();
        return settings.enabled ? createOpenRouterVoiceTranscriber(settings, readAudio) : null;
      },
      requestPermission: async () => ({ granted: true, canAskAgain: true }),
      async configureRecording() {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      },
      async releaseRecording() {
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        mediaRecorder = null;
      },
      deleteRecording: (recordingUri) => URL.revokeObjectURL(recordingUri),
      readDraft: () => {
        const snapshot = latest.current.observe();
        const cursor = Math.max(0, Math.min(snapshot.text.length, latest.current.readCursor()));
        return { ...snapshot, selection: { start: cursor, end: cursor } };
      },
      commitDraft: (text, selection) => latest.current.commitText(text, selection.end),
      onStateChange: setState,
    });
  }
  const controller = controllerRef.current;
  useEffect(() => () => controller.ownerChanged(), [controller, input.ownerKey]);
  useEffect(() => {
    if (input.disabled) controller.ownerChanged();
  }, [controller, input.disabled]);
  useEffect(() => {
    if (state.phase !== "recording") return;
    const sample = () => {
      const seconds = Math.floor(
        (clock.current.elapsed + performance.now() - clock.current.resumedAt) / 1000,
      );
      setElapsedSeconds(Math.min(seconds, VOICE_RECORDING_LIMIT_SECONDS));
      if (seconds >= VOICE_RECORDING_LIMIT_SECONDS) void controller.stop();
    };
    sample();
    const timer = setInterval(sample, 1000);
    return () => clearInterval(timer);
  }, [controller, state.phase]);
  return {
    state,
    elapsedSeconds,
    isBusy: voiceInputBlocksSubmission(state),
    isAvailable:
      settings.enabled &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
    start: () => {
      if (!latest.current.disabled) void controller.start();
    },
    stop: () => {
      void controller.stop();
    },
    cancel: () => controller.cancel(),
    togglePause: () => controller.togglePause(),
  };
}
