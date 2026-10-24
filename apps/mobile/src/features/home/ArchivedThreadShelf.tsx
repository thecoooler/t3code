import { useState } from "react";
import { Pressable, View } from "react-native";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { AppText } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { useEnvironmentScope } from "../../state/session";
import { useThreadListV2ShelfPreferences } from "../threads/use-thread-list-v2-shelf-preferences";
import { ThreadListV2ArchivedShelfHeader } from "../threads/thread-list-v2-items";
import { useArchivedThreadListActions } from "./useThreadListActions";

function ArchivedShelfRow(props: {
  readonly thread: EnvironmentThreadShell;
  readonly onSelect: () => void;
  readonly onRestore: () => void;
}) {
  const canOperate = useEnvironmentScope(props.thread.environmentId, AuthOrchestrationOperateScope);
  return (
    <View className="min-h-12 flex-row items-center gap-2 px-3">
      <Pressable
        accessibilityRole="button"
        onPress={props.onSelect}
        className="min-w-0 flex-1 py-3"
      >
        <AppText numberOfLines={1} className="text-sm text-foreground-muted">
          {props.thread.title}
        </AppText>
      </Pressable>
      <Button label="Unarchive" tone="text" disabled={!canOperate} onPress={props.onRestore} />
    </View>
  );
}

export function ArchivedThreadShelf(props: {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onSelectThread: (thread: EnvironmentThreadShell) => void;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly onRefresh: () => void;
  readonly pane: "screen" | "sidebar";
}) {
  const { loaded, archivedShelfExpanded, toggleArchivedShelf } = useThreadListV2ShelfPreferences();
  const [visibleCount, setVisibleCount] = useState(10);
  const { unarchiveThread } = useArchivedThreadListActions(() => {});
  return (
    <View>
      <ThreadListV2ArchivedShelfHeader
        count={props.threads.length}
        expanded={archivedShelfExpanded}
        disabled={!loaded}
        onToggle={toggleArchivedShelf}
        pane={props.pane}
      />
      {archivedShelfExpanded ? (
        <>
          {props.threads.slice(0, visibleCount).map((thread) => (
            <ArchivedShelfRow
              key={`${thread.environmentId}:${thread.id}`}
              thread={thread}
              onSelect={() => props.onSelectThread(thread)}
              onRestore={() => unarchiveThread(thread)}
            />
          ))}
          {props.isLoading ? (
            <AppText className="px-3 py-2 text-xs text-foreground-muted">Loading archive…</AppText>
          ) : null}
          {props.error ? (
            <View className="px-3">
              <AppText>{props.error}</AppText>
              <Button label="Retry" onPress={props.onRefresh} tone="text" />
            </View>
          ) : null}
          {!props.isLoading && !props.error && props.threads.length === 0 ? (
            <AppText className="px-3 py-2 text-xs text-foreground-muted">
              No archived threads
            </AppText>
          ) : null}
          {props.threads.length > visibleCount ? (
            <Button
              label={`Show ${Math.min(25, props.threads.length - visibleCount)} more`}
              onPress={() => setVisibleCount((count) => count + 25)}
              tone="text"
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
