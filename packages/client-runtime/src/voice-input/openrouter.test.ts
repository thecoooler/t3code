import { describe, expect, it, vi } from "vite-plus/test";
import {
  createOpenRouterVoiceTranscriber,
  DEFAULT_OPENROUTER_VOICE_SETTINGS,
  parseOpenRouterVoiceSettings,
} from "./openrouter.ts";

const configured = { ...DEFAULT_OPENROUTER_VOICE_SETTINGS, enabled: true, apiKey: "test-key" };

describe("OpenRouter voice transcription", () => {
  it("posts the actual audio format and language hint to the transcription endpoint", async () => {
    const request = vi.fn(async () => Response.json({ text: "Привет" }));
    const original = globalThis.fetch;
    globalThis.fetch = request;
    try {
      const signal = new AbortController().signal;
      const transcriber = createOpenRouterVoiceTranscriber(
        { ...configured, language: "ru", temperature: 0.2 },
        async () => ({ data: "YWJj", format: "webm" }),
      );
      const prepared = await transcriber.prepare({ signal });
      expect(await prepared.transcribe("blob:recording", { signal })).toBe("Привет");
      expect(request).toHaveBeenCalledWith("https://openrouter.ai/api/v1/audio/transcriptions", {
        method: "POST",
        signal,
        headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/whisper-1",
          input_audio: { data: "YWJj", format: "webm" },
          language: "ru",
          temperature: 0.2,
        }),
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not upload audio when canceled while reading the recording", async () => {
    const abort = new AbortController();
    const request = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = request;
    try {
      const transcriber = createOpenRouterVoiceTranscriber(configured, async () => {
        abort.abort();
        return { data: "YWJj", format: "m4a" };
      });
      const prepared = await transcriber.prepare({ signal: abort.signal });
      await expect(
        prepared.transcribe("file:///recording", { signal: abort.signal }),
      ).rejects.toMatchObject({ code: "cancelled" });
      expect(request).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("aborts an in-flight HTTP request with the session signal", async () => {
    const abort = new AbortController();
    const entered = Promise.withResolvers<void>();
    const request = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Canceled", "AbortError")),
            { once: true },
          );
          entered.resolve();
        }),
    );
    const original = globalThis.fetch;
    globalThis.fetch = request;
    try {
      const prepared = await createOpenRouterVoiceTranscriber(configured, async () => ({
        data: "YWJj",
        format: "webm",
      })).prepare({ signal: abort.signal });
      const result = prepared.transcribe("blob:recording", { signal: abort.signal });
      const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
      await entered.promise;
      abort.abort();
      await rejected;
    } finally {
      globalThis.fetch = original;
    }
  });

  it("rejects missing credentials before capturing audio and sanitizes stored settings", async () => {
    await expect(
      createOpenRouterVoiceTranscriber(DEFAULT_OPENROUTER_VOICE_SETTINGS, vi.fn()).prepare({
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "preparation-failed" });
    expect(parseOpenRouterVoiceSettings({ enabled: "yes", apiKey: 123, temperature: 2 })).toEqual(
      DEFAULT_OPENROUTER_VOICE_SETTINGS,
    );
  });
});
