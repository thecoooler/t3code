import { useState } from "react";
import { Switch, View } from "react-native";
import type { OpenRouterVoiceSettings } from "@t3tools/client-runtime/voice-input";
import { AppText, AppTextInput } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { SettingsSection } from "../settings/components/SettingsSection";
import { saveOpenRouterVoiceSettings, useOpenRouterVoiceSettings } from "./openRouterSettings";

export function OpenRouterVoiceSettingsSection() {
  const { settings, error, setError } = useOpenRouterVoiceSettings();
  const [draft, setDraft] = useState<OpenRouterVoiceSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? settings;
  const patch = (next: Partial<OpenRouterVoiceSettings>) => setDraft({ ...value, ...next });
  return (
    <SettingsSection title="OpenRouter voice input">
      <View className="gap-3 p-4">
        <AppText className="text-sm text-foreground-muted">
          Send recordings directly to OpenRouter for transcription. Settings and the API key are
          saved securely on this device. Turn off to use local dictation.
        </AppText>
        <View className="flex-row items-center justify-between">
          <AppText>Use OpenRouter</AppText>
          <Switch
            accessibilityLabel="Use OpenRouter voice input"
            disabled={saving}
            value={value.enabled}
            onValueChange={(enabled) => patch({ enabled })}
          />
        </View>
        {(
          [
            ["apiKey", "API key", "OpenRouter API key"],
            ["model", "Transcription model", "openai/whisper-1"],
            ["language", "Language (optional)", "Two-letter code, such as ru or en"],
          ] as const
        ).map(([key, label, placeholder]) => (
          <View key={key} className="gap-1">
            <AppText className="text-sm">{label}</AppText>
            <AppTextInput
              accessibilityLabel={label}
              className="rounded-lg border border-border p-3 text-foreground"
              editable={!saving}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={key === "apiKey"}
              maxLength={key === "language" ? 2 : undefined}
              placeholder={placeholder}
              value={value[key]}
              onChangeText={(text) => patch({ [key]: text })}
            />
          </View>
        ))}
        <AppText className="text-sm">Temperature (0–1): {value.temperature.toFixed(1)}</AppText>
        <View className="flex-row gap-3">
          <Button
            disabled={saving}
            label="Decrease"
            onPress={() =>
              patch({ temperature: Math.max(0, Math.round((value.temperature - 0.1) * 10) / 10) })
            }
          />
          <Button
            disabled={saving}
            label="Increase"
            onPress={() =>
              patch({ temperature: Math.min(1, Math.round((value.temperature + 0.1) * 10) / 10) })
            }
          />
        </View>
        <Button
          label="Save voice settings"
          loading={saving}
          disabled={draft === null}
          onPress={() => {
            setSaving(true);
            void saveOpenRouterVoiceSettings(value)
              .then(
                () => {
                  setDraft(null);
                  setError(null);
                },
                () => setError("Could not save OpenRouter voice settings."),
              )
              .finally(() => setSaving(false));
          }}
        />
        {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
      </View>
    </SettingsSection>
  );
}
