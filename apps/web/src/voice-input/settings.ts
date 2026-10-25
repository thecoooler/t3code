import { useSyncExternalStore } from "react";
import {
  DEFAULT_OPENROUTER_VOICE_SETTINGS,
  parseOpenRouterVoiceSettings,
  type OpenRouterVoiceSettings,
} from "@t3tools/client-runtime/voice-input";

const STORAGE_KEY = "t3code.openrouter-voice";
const CHANGE_EVENT = "t3code:voice-settings";

function snapshot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}
export function readVoiceSettings(): OpenRouterVoiceSettings {
  try {
    return parseOpenRouterVoiceSettings(JSON.parse(snapshot() ?? "null"));
  } catch {
    return DEFAULT_OPENROUTER_VOICE_SETTINGS;
  }
}
export function saveVoiceSettings(settings: OpenRouterVoiceSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function useVoiceSettings(): OpenRouterVoiceSettings {
  const stored = useSyncExternalStore(subscribe, snapshot, () => null);
  try {
    return parseOpenRouterVoiceSettings(JSON.parse(stored ?? "null"));
  } catch {
    return DEFAULT_OPENROUTER_VOICE_SETTINGS;
  }
}
