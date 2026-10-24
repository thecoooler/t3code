import * as SecureStore from "expo-secure-store";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_OPENROUTER_VOICE_SETTINGS,
  parseOpenRouterVoiceSettings,
  type OpenRouterVoiceSettings,
} from "@t3tools/client-runtime/voice-input";

const KEY = "t3code.openrouter-voice";
let settings = DEFAULT_OPENROUTER_VOICE_SETTINGS;
let loading: Promise<OpenRouterVoiceSettings> | null = null;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function loadOpenRouterVoiceSettings(): Promise<OpenRouterVoiceSettings> {
  loading ??= SecureStore.getItemAsync(KEY)
    .then((stored) => {
      settings = parseOpenRouterVoiceSettings(stored ? JSON.parse(stored) : null);
      listeners.forEach((listener) => listener());
      return settings;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}
export async function saveOpenRouterVoiceSettings(next: OpenRouterVoiceSettings): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  settings = next;
  loading = Promise.resolve(next);
  listeners.forEach((listener) => listener());
}
export function readOpenRouterVoiceSettings(): OpenRouterVoiceSettings {
  return settings;
}

export function useOpenRouterVoiceSettings() {
  const value = useSyncExternalStore(subscribe, () => settings);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void loadOpenRouterVoiceSettings().catch(() =>
      setError("Could not load OpenRouter voice settings."),
    );
  }, []);
  return { settings: value, error, setError };
}
