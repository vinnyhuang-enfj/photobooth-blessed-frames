import frame01 from "@/assets/frame01.jpg.asset.json";
import frame02 from "@/assets/frame02.jpg.asset.json";
import frame03 from "@/assets/frame03.jpg.asset.json";
import frame04 from "@/assets/frame04.jpg.asset.json";
import frame05 from "@/assets/frame05.jpg.asset.json";
import frame06 from "@/assets/frame06.jpg.asset.json";
import frame01Hole from "@/assets/frame01-hole.png.asset.json";
import frame02Hole from "@/assets/frame02-hole.png.asset.json";
import frame03Hole from "@/assets/frame03-hole.png.asset.json";
import frame04Hole from "@/assets/frame04-hole.png.asset.json";
import frame05Hole from "@/assets/frame05-hole.png.asset.json";
import frame06Hole from "@/assets/frame06-hole.png.asset.json";

export type Rect = { x: number; y: number; w: number; h: number };

export type Frame = {
  id: string;
  label: string;
  url: string;
  overlay: string;
  /** natural size of the frame artwork */
  canvas: { w: number; h: number };
  /** photo window measured on the artwork */
  window: Rect;
};

export const FRAMES: Frame[] = [
  {
    id: "frame01",
    label: "圖框 01",
    url: frame01.url,
    overlay: frame01Hole.url,
    canvas: { w: 1920, h: 1920 },
    window: { x: 148, y: 207, w: 1627, h: 1467 },
  },
  {
    id: "frame02",
    label: "圖框 02",
    url: frame02.url,
    overlay: frame02Hole.url,
    canvas: { w: 1920, h: 1920 },
    window: { x: 108, y: 307, w: 1703, h: 1442 },
  },
  {
    id: "frame03",
    label: "圖框 03",
    url: frame03.url,
    overlay: frame03Hole.url,
    canvas: { w: 1920, h: 1919 },
    window: { x: 88, y: 145, w: 1744, h: 1568 },
  },
  {
    id: "frame04",
    label: "圖框 04",
    url: frame04.url,
    overlay: frame04Hole.url,
    canvas: { w: 1920, h: 1919 },
    window: { x: 142, y: 253, w: 1636, h: 1542 },
  },
  {
    id: "frame05",
    label: "圖框 05",
    url: frame05.url,
    overlay: frame05Hole.url,
    canvas: { w: 1920, h: 1920 },
    window: { x: 109, y: 128, w: 1811, h: 1656 },
  },
  {
    id: "frame06",
    label: "圖框 06",
    url: frame06.url,
    overlay: frame06Hole.url,
    canvas: { w: 1920, h: 1920 },
    window: { x: 222, y: 112, w: 1475, h: 1355 },
  },
];


export function windowPct(frame: Frame) {
  return {
    left: (frame.window.x / frame.canvas.w) * 100,
    top: (frame.window.y / frame.canvas.h) * 100,
    width: (frame.window.w / frame.canvas.w) * 100,
    height: (frame.window.h / frame.canvas.h) * 100,
  };
}

export type Adjust = { zoom: number; offsetX: number; offsetY: number };

export const DEFAULT_ADJUST: Adjust = { zoom: 1, offsetX: 0, offsetY: 0 };

/** cover-fit so the photo always fills the window, plus zoom/offset fine tuning */
export function computeFit(win: Rect, sw: number, sh: number, adjust: Adjust) {
  const base = Math.max(win.w / sw, win.h / sh);
  const scale = base * adjust.zoom;
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = win.x + (win.w - dw) / 2 + adjust.offsetX * win.w;
  const dy = win.y + (win.h - dh) / 2 + adjust.offsetY * win.h;
  return { dx, dy, dw, dh };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** synchronous single-frame composite used by both photo and video paths */
export function drawComposite(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  frame: Frame,
  adjust: Adjust,
  overlay: HTMLImageElement,
  mirror = false,
) {
  const win: Rect = { ...frame.window };
  ctx.clearRect(0, 0, frame.canvas.w, frame.canvas.h);
  ctx.fillStyle = "#000";
  ctx.fillRect(win.x, win.y, win.w, win.h);

  const { dx, dy, dw, dh } = computeFit(win, sw, sh, adjust);
  ctx.save();
  ctx.beginPath();
  ctx.rect(win.x, win.y, win.w, win.h);
  ctx.clip();
  if (mirror) {
    ctx.translate(frame.canvas.w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, frame.canvas.w - dx - dw, dy, dw, dh);
  } else {
    ctx.drawImage(source, dx, dy, dw, dh);
  }
  ctx.restore();
  ctx.drawImage(overlay, 0, 0, frame.canvas.w, frame.canvas.h);
}

export async function composite(
  source: CanvasImageSource & { width?: number; height?: number },
  sw: number,
  sh: number,
  frame: Frame,
  adjust: Adjust,
  mirror = false,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = frame.canvas.w;
  canvas.height = frame.canvas.h;
  const ctx = canvas.getContext("2d")!;
  // keep the photo strictly inside the window so the frame border stays visible
  const win: Rect = { ...frame.window };
  ctx.fillStyle = "#000";
  ctx.fillRect(win.x, win.y, win.w, win.h);

  const { dx, dy, dw, dh } = computeFit(win, sw, sh, adjust);
  ctx.save();
  ctx.beginPath();
  ctx.rect(win.x, win.y, win.w, win.h);
  ctx.clip();
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, canvas.width - dx - dw, dy, dw, dh);
  } else {
    ctx.drawImage(source, dx, dy, dw, dh);
  }
  ctx.restore();

  const art = await loadImage(frame.overlay);
  ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
