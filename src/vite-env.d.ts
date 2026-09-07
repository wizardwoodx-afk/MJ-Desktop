/// <reference types="vite/client" />

interface Window {
  __mjErrors?: string[];
  __mjActiveWorkflowId?: string;
  __mjLastNodeExec?: Record<string, string>;
  __mjCanvas?: {
    fitView: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    autoLayout: () => void;
    focusNode: (id: string) => void;
  };
  __TAURI_INTERNALS__?: unknown;
}
