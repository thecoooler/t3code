import { FileDiff, Files, MessageSquare } from "lucide-react";
import { memo } from "react";

import type { RightPanelKind } from "../../rightPanelStore";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Toggle, ToggleGroup } from "../ui/toggle-group";

export type ThreadView = "thread" | "pull-request" | "files" | "changes";

/**
 * The bar's view for what the workspace shows. A right panel only counts when it fills the
 * workspace (maximized or a sheet); side by side, the thread is still the main view.
 */
export function resolveThreadView(input: {
  readonly fillsWorkspace: boolean;
  readonly activeKind: RightPanelKind | null;
}): ThreadView | null {
  if (!input.fillsWorkspace || input.activeKind === null) return "thread";
  switch (input.activeKind) {
    case "pull-request":
    case "pull-requests":
      return "pull-request";
    case "files":
    case "file":
      return "files";
    case "diff":
      return "changes";
    default:
      return null;
  }
}

export const ThreadViewBar = memo(function ThreadViewBar(props: {
  readonly view: ThreadView | null;
  readonly pullRequestAvailable: boolean;
  readonly filesAvailable: boolean;
  readonly changesAvailable: boolean;
  readonly onSelect: (view: ThreadView) => void;
}) {
  const PullRequestIcon = PullRequestGlyph.pullRequest;
  return (
    <nav
      aria-label="Thread views"
      className="flex shrink-0 items-center justify-center border-t border-border bg-background px-2 py-1"
    >
      <ToggleGroup
        aria-label="Thread view"
        variant="segmented"
        value={props.view ? [props.view] : []}
        onValueChange={(value) => {
          const next = value[0];
          if (
            next === "thread" ||
            next === "pull-request" ||
            next === "files" ||
            next === "changes"
          ) {
            props.onSelect(next);
          }
        }}
      >
        <Toggle value="thread" aria-label="Thread">
          <MessageSquare className="size-3.5" />
          Thread
        </Toggle>
        <Toggle
          value="pull-request"
          aria-label="Pull request"
          disabled={!props.pullRequestAvailable}
        >
          <PullRequestIcon className="size-3.5" />
          Pull request
        </Toggle>
        <Toggle value="files" aria-label="Files" disabled={!props.filesAvailable}>
          <Files className="size-3.5" />
          Files
        </Toggle>
        <Toggle value="changes" aria-label="Changes" disabled={!props.changesAvailable}>
          <FileDiff className="size-3.5" />
          Changes
        </Toggle>
      </ToggleGroup>
    </nav>
  );
});
