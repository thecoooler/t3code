export function formatModelTagHref(instanceId: string, model: string): string {
  return `t3-model://${encodeURIComponent(instanceId)}/${encodeURIComponent(model)}`;
}

export function formatProviderTagHref(instanceId: string): string {
  return `t3-provider://${encodeURIComponent(instanceId)}`;
}

export type ParsedModelTag = {
  kind: "model";
  instanceId: string;
  model: string;
};

export type ParsedProviderTag = {
  kind: "provider";
  instanceId: string;
};

export type ParsedModelOrProviderTag = ParsedModelTag | ParsedProviderTag;

export function parseModelTagHref(href: string): ParsedModelTag | null {
  const match = /^t3-model:\/\/([^/\s)]+)\/([^)\s]+)$/iu.exec(href);
  if (!match) return null;
  try {
    const instanceId = decodeURIComponent(match[1]!);
    const model = decodeURIComponent(match[2]!);
    return { kind: "model", instanceId, model };
  } catch {
    return null;
  }
}

export function parseProviderTagHref(href: string): ParsedProviderTag | null {
  const match = /^t3-provider:\/\/([^/\s)]+)$/iu.exec(href);
  if (!match) return null;
  try {
    const instanceId = decodeURIComponent(match[1]!);
    return { kind: "provider", instanceId };
  } catch {
    return null;
  }
}

export function parseModelOrProviderTagHref(href: string): ParsedModelOrProviderTag | null {
  return parseModelTagHref(href) ?? parseProviderTagHref(href);
}

export function isModelOrProviderTagHref(href: string): boolean {
  return href.startsWith("t3-model://") || href.startsWith("t3-provider://");
}

const MODEL_TAG_LINK =
  /\[([^\]]+)\]\((t3-model:\/\/([^/\s)]+)\/([^)\s]+)|t3-provider:\/\/([^/\s)]+))\)/gu;

export interface ModelOrProviderTagOccurrence {
  tagKind: "model" | "provider";
  instanceId: string;
  model?: string;
  label: string;
  source: string;
  start: number;
  end: number;
}

export function collectModelAndProviderTags(text: string): ModelOrProviderTagOccurrence[] {
  const occurrences: ModelOrProviderTagOccurrence[] = [];
  if (!text.includes("](t3-model://") && !text.includes("](t3-provider://")) {
    return occurrences;
  }
  for (const match of text.matchAll(MODEL_TAG_LINK)) {
    const label = match[1] ?? "";
    const href = match[2] ?? "";
    const parsed = parseModelOrProviderTagHref(href);
    if (!parsed) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    occurrences.push({
      tagKind: parsed.kind,
      instanceId: parsed.instanceId,
      model: parsed.kind === "model" ? parsed.model : undefined,
      label,
      source: match[0],
      start,
      end,
    });
  }
  return occurrences;
}
