import { useState } from "react";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { saveVoiceSettings, useVoiceSettings } from "../../voice-input/settings";
import type { OpenRouterVoiceSettings } from "@t3tools/client-runtime/voice-input";

export function VoiceInputSettings() {
  const settings = useVoiceSettings();
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<OpenRouterVoiceSettings>) => {
    try {
      saveVoiceSettings({ ...settings, ...patch });
      setError(null);
    } catch {
      setError("Could not save voice input settings. Check browser storage access.");
    }
  };
  return (
    <SettingsSection id="voice-input" title="Voice input">
      <p className="text-sm text-muted-foreground">
        Transcribe microphone recordings with OpenRouter. Audio is sent directly from this device
        when you finish recording. These settings and the API key are stored in this browser or
        desktop profile, separately from environment settings.
      </p>
      <SettingsGroup>
        <SettingsRow
          title="OpenRouter voice input"
          description="Show recording controls in the chat composer."
        >
          <Switch
            checked={settings.enabled}
            onCheckedChange={(enabled) => update({ enabled })}
            aria-label="Enable OpenRouter voice input"
          />
        </SettingsRow>
        <SettingsRow title="API key" description="Your OpenRouter API key.">
          <Input
            type="password"
            autoComplete="off"
            aria-label="OpenRouter API key"
            value={settings.apiKey}
            onChange={(event) => update({ apiKey: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow
          title="Transcription model"
          description="An OpenRouter speech-to-text model ID, such as openai/whisper-1."
        >
          <Input
            aria-label="Transcription model"
            value={settings.model}
            onChange={(event) => update({ model: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow
          title="Language"
          description="Optional two-letter language code, such as ru or en. Leave empty to detect automatically."
        >
          <Input
            aria-label="Transcription language"
            maxLength={2}
            value={settings.language}
            onChange={(event) => update({ language: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow
          title="Temperature"
          description="From 0 to 1. Lower values make transcription more deterministic."
        >
          <Input
            aria-label="Transcription temperature"
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={settings.temperature}
            onChange={(event) => {
              const temperature = event.target.valueAsNumber;
              if (Number.isFinite(temperature) && temperature >= 0 && temperature <= 1)
                update({ temperature });
            }}
          />
        </SettingsRow>
      </SettingsGroup>
      {error ? <p role="alert">{error}</p> : null}
    </SettingsSection>
  );
}
