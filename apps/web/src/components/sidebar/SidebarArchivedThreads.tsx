import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Undo2Icon } from "lucide-react";
import { AuthOrchestrationOperateScope, type EnvironmentId } from "@t3tools/contracts";
import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Schema } from "effect";

import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { useThreadActions } from "../../hooks/useThreadActions";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useEnvironmentScope } from "../../state/session";
import { buildThreadRouteParams } from "../../threadRoutes";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { toastManager } from "../ui/toast";

function RestoreThreadButton(props: { environmentId: EnvironmentId; onRestore: () => void }) {
  const canOperate = useEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope);
  return (
    <button
      type="button"
      aria-label="Unarchive thread"
      disabled={!canOperate}
      onClick={props.onRestore}
      className="shrink-0 cursor-pointer rounded-md p-1 text-sidebar-muted-foreground hover:text-sidebar-foreground disabled:cursor-default disabled:opacity-40"
    >
      <Undo2Icon className="size-3.5" />
    </button>
  );
}

export function SidebarArchivedThreads(props: {
  readonly environmentIds: readonly EnvironmentId[];
  readonly scopedProjectKeys: ReadonlySet<string> | null;
}) {
  const [expanded, setExpanded] = useLocalStorage(
    "t3code:sidebar:archived-expanded",
    false,
    Schema.Boolean,
  );
  const [visibleCount, setVisibleCount] = useState(10);
  const { snapshots, error, isLoading, refresh } = useArchivedThreadSnapshots(props.environmentIds);
  const { unarchiveThread } = useThreadActions();
  const threads = snapshots
    .flatMap(({ environmentId, snapshot }) =>
      snapshot.threads
        .filter(
          (thread) =>
            thread.lineage.relationshipToParent !== "subagent" &&
            (props.scopedProjectKeys === null ||
              props.scopedProjectKeys.has(`${environmentId}:${thread.projectId}`)),
        )
        .map((thread) => presentThreadShell(environmentId, thread)),
    )
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));

  const restore = async (thread: (typeof threads)[number]) => {
    const result = await unarchiveThread(scopeThreadRef(thread.environmentId, thread.id));
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const failure = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Failed to unarchive thread",
        description: failure instanceof Error ? failure.message : String(failure),
      });
    }
  };

  return (
    <div className="mt-1">
      <div className="mx-0.5 h-8">
        <CollapsibleSectionHeader
          expanded={expanded}
          tone="muted"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Archived" : `Archived (${threads.length})`}
        </CollapsibleSectionHeader>
      </div>
      {expanded ? (
        <ul className="m-0 list-none p-0" aria-label="Archived threads">
          {threads.slice(0, visibleCount).map((thread) => (
            <li
              key={`${thread.environmentId}:${thread.id}`}
              className="flex h-9 items-center gap-1 rounded-md px-2.5 hover:bg-sidebar-row-hover"
            >
              <Link
                to="/$environmentId/$threadId"
                params={buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id))}
                className="min-w-0 flex-1 truncate text-sm text-sidebar-muted-foreground hover:text-sidebar-foreground"
              >
                {thread.title}
              </Link>
              <RestoreThreadButton
                environmentId={thread.environmentId}
                onRestore={() => void restore(thread)}
              />
            </li>
          ))}
          {isLoading ? (
            <li className="px-2.5 py-2 text-xs text-sidebar-muted-foreground" role="status">
              Loading archive…
            </li>
          ) : null}
          {error ? (
            <li className="px-2.5 py-2 text-xs text-sidebar-muted-foreground" role="alert">
              {error}{" "}
              <button type="button" onClick={refresh}>
                Retry
              </button>
            </li>
          ) : null}
          {!isLoading && !error && threads.length === 0 ? (
            <li className="px-2.5 py-2 text-xs text-sidebar-muted-foreground">
              No archived threads
            </li>
          ) : null}
          {threads.length > visibleCount ? (
            <li>
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 25)}
                className="h-9 w-full cursor-pointer px-2.5 text-left text-xs text-sidebar-muted-foreground hover:text-sidebar-foreground"
              >
                Show {Math.min(25, threads.length - visibleCount)} more
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
