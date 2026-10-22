import { CheckIcon, MicIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import type { useVoiceInput } from "./useVoiceInput";

export function VoiceInputControl({
  voice,
  disabled,
}: {
  voice: ReturnType<typeof useVoiceInput>;
  disabled: boolean;
}) {
  const { phase, error } = voice.state;
  if (!voice.isAvailable && phase === "idle") return null;
  return (
    <div className="flex items-center gap-1">
      {voice.isBusy ? (
        <>
          <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
            {phase === "recording" ? <span className="size-2 rounded-full bg-red-500" /> : null}
            {phase === "recording" || phase === "paused"
              ? `${phase === "paused" ? "Paused" : "Recording"} ${Math.floor(voice.elapsedSeconds / 60)}:${String(voice.elapsedSeconds % 60).padStart(2, "0")}`
              : phase === "transcribing"
                ? "Transcribing…"
                : "Preparing…"}
          </span>
          {phase === "recording" || phase === "paused" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={phase === "paused" ? "Resume recording" : "Pause recording"}
                onClick={voice.togglePause}
              >
                {phase === "paused" ? <PlayIcon /> : <PauseIcon />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Transcribe recording"
                onClick={voice.stop}
              >
                <CheckIcon />
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel voice input"
            onClick={voice.cancel}
          >
            <XIcon />
          </Button>
        </>
      ) : (
        <>
          {error ? (
            <span role="alert" className="max-w-48 text-xs text-destructive">
              {error}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled || !voice.isAvailable}
            aria-label="Start voice input"
            onClick={voice.start}
          >
            <MicIcon />
          </Button>
          {error ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss voice input error"
              onClick={voice.cancel}
            >
              <XIcon />
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
