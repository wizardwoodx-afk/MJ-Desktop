import { useEffect, useState } from "react";

type Kind = "ok" | "err" | "info";
interface ToastItem {
  id: number;
  msg: string;
  kind: Kind;
}

let seq = 0;
const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];

function emit() {
  listeners.forEach((l) => l(items));
}

export function toast(msg: string, kind: Kind = "ok") {
  const id = ++seq;
  items = [...items.slice(-4), { id, msg, kind }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 3200);
}

export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return (
    <div className="toast-host" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
