import { useAtomValue } from "@effect/atom-react";
import { BotIcon, CpuIcon } from "lucide-react";
import { memo, useMemo } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { serverEnvironment } from "~/state/server";
import { deriveProviderInstanceEntries } from "~/providerInstances";
import { ContextChip, ContextChipLabel } from "../ContextChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

export interface ModelTagChipProps {
  tagKind: "model" | "provider";
  instanceId: string;
  model?: string | undefined;
  label: string;
  className?: string;
  onSelect?: (() => void) | undefined;
}

export const ModelTagChip = memo(function ModelTagChip(props: ModelTagChipProps) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const providersAtom = primaryEnvironmentId
    ? serverEnvironment.providersValueAtom(primaryEnvironmentId)
    : null;
  const providers = useAtomValue(providersAtom);

  const instanceEntry = useMemo(() => {
    if (!providers) return null;
    const entries = deriveProviderInstanceEntries(providers);
    return entries.find((candidate) => candidate.instanceId === props.instanceId) ?? null;
  }, [providers, props.instanceId]);

  const chipContent = (
    <ContextChip
      kind={props.tagKind === "model" ? "model" : "provider"}
      className={props.className}
      data-composer-model-tag="true"
      data-model-slug={props.model}
      data-instance-id={props.instanceId}
    >
      {instanceEntry ? (
        <ProviderInstanceIcon
          driverKind={instanceEntry.driverKind}
          displayName={instanceEntry.displayName}
          accentColor={instanceEntry.accentColor}
          acpRegistryAgentId={instanceEntry.agentId}
          acpRegistryIconUrl={instanceEntry.iconUrl}
          className="size-[1.17em] shrink-0"
        />
      ) : props.tagKind === "model" ? (
        <CpuIcon aria-hidden="true" className="size-[1.17em] shrink-0" />
      ) : (
        <BotIcon aria-hidden="true" className="size-[1.17em] shrink-0" />
      )}
      <ContextChipLabel>{props.label}</ContextChipLabel>
    </ContextChip>
  );

  const tooltipTitle =
    props.tagKind === "model" ? props.label : (instanceEntry?.displayName ?? props.label);
  const tooltipSubtitle =
    props.tagKind === "model"
      ? instanceEntry?.displayName
        ? `Provider: ${instanceEntry.displayName}`
        : `Instance: ${props.instanceId}`
      : "Provider";
  const modelSlugInfo =
    props.model && props.model !== props.label ? `Model ID: ${props.model}` : null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          props.onSelect ? (
            <button
              type="button"
              onClick={props.onSelect}
              className="inline-flex cursor-pointer border-0 bg-transparent p-0 align-middle text-inherit"
            />
          ) : (
            <span className="inline-flex align-middle" />
          )
        }
      >
        {chipContent}
      </TooltipTrigger>
      <TooltipPopup side="top" className="flex flex-col gap-0.5 text-xs">
        <span className="font-semibold">{tooltipTitle}</span>
        <span className="text-secondary-label">{tooltipSubtitle}</span>
        {modelSlugInfo ? (
          <span className="font-mono text-[11px] text-muted-foreground">{modelSlugInfo}</span>
        ) : null}
      </TooltipPopup>
    </Tooltip>
  );
});
