export type DesktopHost = "tauri" | "web";

export function detectHost(): DesktopHost {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__) ? "tauri" : "web";
}

export function detectPlatform(): "mac" | "win" | "linux" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  return "linux";
}

export interface WindowApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  startDragging: () => Promise<void>;
  isFullscreen: () => Promise<boolean>;
  setFullscreen: (v: boolean) => Promise<void>;
  setAlwaysOnTop: (v: boolean) => Promise<void>;
}

export async function getWindowApi(): Promise<WindowApi> {
  if (detectHost() === "tauri") {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      return {
        minimize: () => w.minimize(),
        toggleMaximize: () => w.toggleMaximize(),
        close: () => w.close(),
        startDragging: () => w.startDragging(),
        isFullscreen: () => w.isFullscreen(),
        setFullscreen: (v) => w.setFullscreen(v),
        setAlwaysOnTop: (v) => w.setAlwaysOnTop(v),
      };
    } catch {
      /* fall through */
    }
  }
  return {
    minimize: async () => {
      document.body.classList.toggle("desk-min", true);
    },
    toggleMaximize: async () => {
      document.body.classList.toggle("desk-max");
    },
    close: async () => {
      window.close();
    },
    startDragging: async () => {},
    isFullscreen: async () => Boolean(document.fullscreenElement),
    setFullscreen: async (v) => {
      if (v) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    },
    setAlwaysOnTop: async () => {},
  };
}

export function notifyNative(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    } else if ("Notification" in window && Notification.permission !== "denied") {
      void Notification.requestPermission().then((p) => {
        if (p === "granted") new Notification(title, { body });
      });
    }
  } catch {
    /* ignore */
  }
}

export function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function pickJsonFile(): Promise<unknown | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.mj.json,.mjpack";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result)));
        } catch {
          resolve(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
