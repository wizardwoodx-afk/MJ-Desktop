export async function snapshotCanvasToPng(el: HTMLElement): Promise<string> {
  const w = el.clientWidth;
  const h = el.clientHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = "12px ui-monospace, monospace";
  ctx.fillText("MJ · canvas snapshot", 16, 24);
  const svg = el.querySelector("svg");
  if (svg) {
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    await new Promise<void>((res) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        res();
      };
      img.onerror = () => res();
      img.src = url;
    });
  }
  return canvas.toDataURL("image/png");
}

export function downloadDataUrl(dataUrl: string, name: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${name}-${Date.now()}.png`;
  a.click();
}
