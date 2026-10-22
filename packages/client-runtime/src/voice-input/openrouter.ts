import {
  throwIfVoiceTranscriptionAborted,
  VoiceTranscriptionError,
  type VoiceTranscriber,
} from "./transcription.ts";

export type OpenRouterVoiceSettings = {
  readonly enabled: boolean;
  readonly apiKey: string;
  readonly model: string;
  readonly language: string;
  readonly temperature: number;
};

export const DEFAULT_OPENROUTER_VOICE_SETTINGS: OpenRouterVoiceSettings = {
  enabled: false,
  apiKey: "",
  model: "openai/whisper-1",
  language: "",
  temperature: 0,
};

export function parseOpenRouterVoiceSettings(value: unknown): OpenRouterVoiceSettings {
  const defaults = DEFAULT_OPENROUTER_VOICE_SETTINGS;
  if (typeof value !== "object" || value === null) return defaults;
  return {
    enabled: "enabled" in value && value.enabled === true,
    apiKey: "apiKey" in value && typeof value.apiKey === "string" ? value.apiKey : "",
    model: "model" in value && typeof value.model === "string" ? value.model : defaults.model,
    language: "language" in value && typeof value.language === "string" ? value.language : "",
    temperature:
      "temperature" in value &&
      typeof value.temperature === "number" &&
      Number.isFinite(value.temperature) &&
      value.temperature >= 0 &&
      value.temperature <= 1
        ? value.temperature
        : 0,
  };
}

export function createOpenRouterVoiceTranscriber(
  settings: OpenRouterVoiceSettings,
  readAudio: (uri: string, signal: AbortSignal) => Promise<{ data: string; format: string }>,
): VoiceTranscriber {
  return {
    async prepare({ signal }) {
      throwIfVoiceTranscriptionAborted(signal);
      if (!settings.apiKey.trim() || !settings.model.trim()) {
        throw new VoiceTranscriptionError(
          "preparation-failed",
          "Set an OpenRouter API key and transcription model in voice input settings.",
        );
      }
      if (settings.language.trim() && !/^[a-z]{2}$/i.test(settings.language.trim())) {
        throw new VoiceTranscriptionError(
          "preparation-failed",
          "Use a two-letter language code, such as en or ru.",
        );
      }
      return {
        locale: settings.language.trim() || "en",
        async transcribe(uri, { signal }) {
          const audio = await readAudio(uri, signal);
          throwIfVoiceTranscriptionAborted(signal);
          const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
            method: "POST",
            signal,
            headers: {
              Authorization: `Bearer ${settings.apiKey.trim()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: settings.model.trim(),
              input_audio: audio,
              ...(settings.language.trim()
                ? { language: settings.language.trim().toLowerCase() }
                : {}),
              temperature: settings.temperature,
            }),
          });
          if (!response.ok) {
            throw new VoiceTranscriptionError(
              "transcription-failed",
              `OpenRouter transcription failed (HTTP ${response.status}). Check your API key, model, and account balance.`,
            );
          }
          const result: unknown = await response.json();
          throwIfVoiceTranscriptionAborted(signal);
          if (
            typeof result !== "object" ||
            result === null ||
            !("text" in result) ||
            typeof result.text !== "string"
          ) {
            throw new VoiceTranscriptionError(
              "transcription-failed",
              "OpenRouter returned an invalid transcript.",
            );
          }
          return result.text;
        },
      };
    },
  };
}
