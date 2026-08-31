export type ShortcutAction =
  | "palette"
  | "save"
  | "undo"
  | "redo"
  | "duplicate"
  | "deleteSelection"
  | "run"
  | "fitView"
  | "closeOverlays"
  | "showShortcuts"
  | "screenshot"
  | "fullscreen"
  | "newWorkflow"
  | "openSettings"
  | "nextWorkflow"
  | "prevWorkflow"
  | "copySelection"
  | "paste"
  | "openHome"
  | "autoLayout"
  | "toggleSidebar"
  | "toggleConsole"
  | "zoomIn"
  | "zoomOut";

export interface ShortcutCtx {
  typing: boolean;
  hasSelection: boolean;
  workflowCount: number;
  clipboardEmpty: boolean;
}

/** Windows-primary: Ctrl. Meta still accepted on macOS hosts. */
export function resolveShortcut(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean },
  ctx: ShortcutCtx,
): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key;

  if (key === "PrintScreen" || (mod && key === "PrintScreen")) return "screenshot";
  if (key === "F11") return "fullscreen";
  if (key === "Escape") return "closeOverlays";
  if (mod && (key === "k" || key === "K")) return "palette";
  if (mod && key === ",") return "openSettings";
  if (mod && (key === "/" || key === "?")) return "showShortcuts";
  if (key === "?" && !ctx.typing) return "showShortcuts";
  if (mod && key === "Enter") return "run";

  if (ctx.typing) return null;

  if (mod && (key === "s" || key === "S") && !e.shiftKey) return "save";
  if (mod && (key === "z" || key === "Z") && e.shiftKey) return "redo";
  if (mod && (key === "z" || key === "Z")) return "undo";
  if (mod && (key === "y" || key === "Y")) return "redo";
  if (mod && (key === "d" || key === "D") && ctx.hasSelection) return "duplicate";
  if ((key === "Delete" || key === "Backspace") && ctx.hasSelection) return "deleteSelection";
  if (mod && (key === "c" || key === "C") && ctx.hasSelection) return "copySelection";
  if (mod && (key === "v" || key === "V") && !ctx.clipboardEmpty) return "paste";
  if (mod && (key === "n" || key === "N")) return "newWorkflow";
  if (mod && key === "Tab") return e.shiftKey ? "prevWorkflow" : "nextWorkflow";
  if (mod && (key === "1" || key === "h" || key === "H") && e.shiftKey) return "openHome";
  if (!mod && (key === "r" || key === "R")) return "run";
  if (!mod && (key === "f" || key === "F")) return "fitView";
  if (mod && (key === "l" || key === "L") && e.shiftKey) return "autoLayout";
  if (mod && (key === "b" || key === "B")) return "toggleSidebar";
  if (mod && (key === "`" || key === "~")) return "toggleConsole";
  if (mod && (key === "=" || key === "+")) return "zoomIn";
  if (mod && key === "-") return "zoomOut";
  if (mod && key === "0") return "fitView";
  return null;
}
