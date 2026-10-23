import { describe, expect, it } from "vitest";

import {
  collectModelAndProviderTags,
  formatModelTagHref,
  formatProviderTagHref,
  isModelOrProviderTagHref,
  parseModelTagHref,
  parseProviderTagHref,
} from "./modelTags";

describe("modelTags", () => {
  it("formats and parses model tag hrefs", () => {
    const href = formatModelTagHref("google-antigravity", "gemini-2.5-flash");
    expect(href).toBe("t3-model://google-antigravity/gemini-2.5-flash");
    expect(isModelOrProviderTagHref(href)).toBe(true);

    const parsed = parseModelTagHref(href);
    expect(parsed).toEqual({
      kind: "model",
      instanceId: "google-antigravity",
      model: "gemini-2.5-flash",
    });
  });

  it("handles encoded characters in model and instanceId", () => {
    const href = formatModelTagHref("openrouter:custom", "meta-llama/llama-3-70b");
    expect(href).toBe("t3-model://openrouter%3Acustom/meta-llama%2Fllama-3-70b");

    const parsed = parseModelTagHref(href);
    expect(parsed).toEqual({
      kind: "model",
      instanceId: "openrouter:custom",
      model: "meta-llama/llama-3-70b",
    });
  });

  it("formats and parses provider tag hrefs", () => {
    const href = formatProviderTagHref("anthropic-1");
    expect(href).toBe("t3-provider://anthropic-1");
    expect(isModelOrProviderTagHref(href)).toBe(true);

    const parsed = parseProviderTagHref(href);
    expect(parsed).toEqual({
      kind: "provider",
      instanceId: "anthropic-1",
    });
  });

  it("collects model and provider tags in text", () => {
    const text =
      "Please compare [Gemini 2.5 Flash](t3-model://google/gemini-2.5-flash) with [Claude 3.7](t3-model://anthropic/claude-3-7) and provider [Anthropic](t3-provider://anthropic).";
    const matches = collectModelAndProviderTags(text);
    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({
      tagKind: "model",
      instanceId: "google",
      model: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
    });
    expect(matches[1]).toMatchObject({
      tagKind: "model",
      instanceId: "anthropic",
      model: "claude-3-7",
      label: "Claude 3.7",
    });
    expect(matches[2]).toMatchObject({
      tagKind: "provider",
      instanceId: "anthropic",
      label: "Anthropic",
    });
  });
});
