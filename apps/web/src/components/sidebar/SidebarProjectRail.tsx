import { SCRATCH_PROJECT_SCOPE_KEY } from "@t3tools/client-runtime/state/project-grouping";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, LayersIcon } from "lucide-react";
import * as Schema from "effect/Schema";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { readLocalApi } from "../../localApi";

import { cn } from "../../lib/utils";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useThreadShells } from "../../state/entities";
import { ProjectFavicon } from "../ProjectFavicon";
import { summarizeSidebarProjectIndicators, type SidebarProjectIndicators } from "../Sidebar.logic";
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";

const HIDDEN_PROJECT_KEYS_SCHEMA = Schema.Array(Schema.String);

const INDICATORS = [
  { key: "working", label: "Working", className: "bg-info" },
  { key: "blocked", label: "Blocked", className: "bg-warning" },
  { key: "done", label: "Done", className: "bg-success" },
] as const;

function ProjectIndicators(props: { indicators: SidebarProjectIndicators | undefined }) {
  const active = INDICATORS.filter((indicator) => props.indicators?.[indicator.key]);
  const openThreadCount = props.indicators?.openThreadCount ?? 0;
  if (active.length === 0 && openThreadCount === 0) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {active.length > 0 ? (
        <span
          className="flex items-center gap-1"
          aria-label={active.map((indicator) => indicator.label).join(", ")}
          role="img"
        >
          {active.map((indicator) => (
            <span
              key={indicator.key}
              className={cn("size-1.5 rounded-full", indicator.className)}
            />
          ))}
        </span>
      ) : null}
      {openThreadCount > 0 ? (
        <span
          className="text-xs tabular-nums text-sidebar-muted-foreground"
          aria-label={`${openThreadCount} open threads`}
        >
          {openThreadCount}
        </span>
      ) : null}
    </span>
  );
}

function ProjectRow(props: {
  readonly project: SidebarProjectSnapshot;
  readonly indicators: SidebarProjectIndicators | undefined;
  readonly selected: boolean;
  readonly hidden: boolean;
  readonly onSelect: () => void;
  readonly onToggleHidden: () => void;
}) {
  const showContextMenu = async (position: { x: number; y: number }) => {
    if (props.project.isScratch) return;
    const api = readLocalApi();
    if (!api) return;
    try {
      const action = await api.contextMenu.show(
        [
          {
            id: "toggle-hidden",
            label: props.hidden ? "Show project" : "Hide project",
            icon: props.hidden ? "check" : "archive",
          },
        ],
        position,
      );
      if (action === "toggle-hidden") props.onToggleHidden();
    } catch {
      return;
    }
  };
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={props.selected}
        onClick={props.onSelect}
        onContextMenu={(event) => {
          if (props.project.isScratch) return;
          event.preventDefault();
          void showContextMenu({ x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          if (props.project.isScratch) return;
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          void showContextMenu({ x: bounds.left, y: bounds.bottom });
        }}
      >
        <ProjectFavicon project={props.project} className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{props.project.displayName}</span>
        <ProjectIndicators indicators={props.indicators} />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function SidebarProjectRail(props: {
  readonly projectGroups: readonly SidebarProjectSnapshot[];
  readonly showNoProject: boolean;
  readonly selectedProjectKey: string | null;
  readonly onSelectProject: (projectKey: string | null) => void;
}) {
  const [hiddenProjectKeys, setHiddenProjectKeys] = useLocalStorage(
    "t3code:sidebar:hidden-project-keys",
    [],
    HIDDEN_PROJECT_KEYS_SCHEMA,
  );
  const [hiddenExpanded, setHiddenExpanded] = useLocalStorage(
    "t3code:sidebar:hidden-projects-expanded",
    false,
    Schema.Boolean,
  );
  const hiddenKeys = new Set(hiddenProjectKeys);
  const visibleProjects = props.projectGroups.filter(
    (project) => project.isScratch || !hiddenKeys.has(project.projectKey),
  );
  const hiddenProjects = props.projectGroups.filter(
    (project) => !project.isScratch && hiddenKeys.has(project.projectKey),
  );
  const toggleHidden = (projectKey: string) => {
    const wasHidden = hiddenKeys.has(projectKey);
    setHiddenProjectKeys((keys) =>
      wasHidden ? keys.filter((key) => key !== projectKey) : [...keys, projectKey],
    );
    if (!wasHidden && props.selectedProjectKey === projectKey) props.onSelectProject(null);
  };
  const threads = useThreadShells();
  const projectKeyByMemberKey = new Map(
    props.projectGroups.flatMap((group) =>
      group.memberProjectRefs.map(
        (ref) => [`${ref.environmentId}:${ref.projectId}`, group.projectKey] as const,
      ),
    ),
  );
  const indicators = summarizeSidebarProjectIndicators({
    threads,
    projectKeyByMemberKey,
  });

  return (
    <nav
      aria-label="Projects"
      className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border"
    >
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={props.selectedProjectKey === null}
              onClick={() => props.onSelectProject(null)}
            >
              <LayersIcon />
              <span className="min-w-0 flex-1 truncate">All projects</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {props.showNoProject && !props.projectGroups.some((project) => project.isScratch) ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={props.selectedProjectKey === SCRATCH_PROJECT_SCOPE_KEY}
                onClick={() => props.onSelectProject(SCRATCH_PROJECT_SCOPE_KEY)}
              >
                <FolderIcon />
                <span className="min-w-0 flex-1 truncate">No project</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {visibleProjects.map((project) => (
            <ProjectRow
              key={project.projectKey}
              project={project}
              selected={props.selectedProjectKey === project.projectKey}
              hidden={false}
              indicators={indicators.byProjectKey.get(project.projectKey)}
              onSelect={() => props.onSelectProject(project.projectKey)}
              onToggleHidden={() => toggleHidden(project.projectKey)}
            />
          ))}
          {hiddenProjects.length > 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-expanded={hiddenExpanded}
                onClick={() => setHiddenExpanded((expanded) => !expanded)}
              >
                {hiddenExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                <span>Hidden ({hiddenProjects.length})</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {hiddenExpanded
            ? hiddenProjects.map((project) => (
                <ProjectRow
                  key={project.projectKey}
                  project={project}
                  selected={props.selectedProjectKey === project.projectKey}
                  hidden={true}
                  indicators={indicators.byProjectKey.get(project.projectKey)}
                  onSelect={() => props.onSelectProject(project.projectKey)}
                  onToggleHidden={() => toggleHidden(project.projectKey)}
                />
              ))
            : null}
        </SidebarMenu>
      </SidebarGroup>
    </nav>
  );
}
