"use client";

/**
 * Ruch i haptyka dla gestów.
 * Sprężyny liczą się od bieżącej wartości i przejmują prędkość palca, więc każdą animację można złapać w połowie.
 * Parametry jak w iOS: `damping` (1 = bez odbicia, < 1 = lekkie odbicie) i `response` (sekundy, im mniej, tym żwawiej).
 */

export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** Gdzie zatrzyma się rzucony element (wzór z „Designing Fluid Interfaces”, WWDC 2018). */
export const project = (velocity: number, decelerationRate = 0.998) => ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);

/** Opór za krawędzią: im dalej, tym mniej element idzie za palcem. */
export const rubberband = (overshoot: number, dimension: number, c = 0.55) =>
  (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));

export type SpringHandle = { stop: () => void; value: () => number; velocity: () => number };
type SpringOpts = { damping?: number; response?: number; velocity?: number; precision?: number; onUpdate: (x: number) => void; onDone?: () => void };

export function spring(from: number, to: number, { damping = 1, response = 0.35, velocity = 0, precision = 0.3, onUpdate, onDone }: SpringOpts): SpringHandle {
  let x = from - to;
  let v = velocity;
  if (reducedMotion() || (Math.abs(x) < precision && Math.abs(v) < precision * 10)) {
    onUpdate(to);
    onDone?.();
    return { stop: () => {}, value: () => to, velocity: () => 0 };
  }
  const k = (2 * Math.PI / response) ** 2;
  const c = (4 * Math.PI * damping) / response;
  let last = performance.now();
  let raf = 0;
  let timer = 0;
  // Zapasowy zegar: gdy przeglądarka wstrzyma klatki (karta w tle, oszczędzanie baterii),
  // animacja i tak dojdzie do końca — komunikat nie zostanie niewidoczny, a arkusz poza ekranem.
  const schedule = () => {
    raf = requestAnimationFrame(step);
    timer = window.setTimeout(() => step(performance.now()), 100);
  };
  const step = (t: number) => {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
    last = t;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    for (let i = 0; i < n; i++) {
      v += (-k * x - c * v) * (dt / n);
      x += v * (dt / n);
    }
    if (Math.abs(x) < precision && Math.abs(v) < precision * 10) {
      x = 0;
      v = 0;
      onUpdate(to);
      onDone?.();
      return;
    }
    onUpdate(to + x);
    schedule();
  };
  schedule();
  return {
    stop: () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    },
    value: () => to + x,
    velocity: () => v,
  };
}

/** Prędkość palca z ostatnich ~80 ms (px/s). */
export function velocityTracker() {
  let samples: { t: number; x: number }[] = [];
  return {
    add(x: number) {
      const t = performance.now();
      samples.push({ t, x });
      samples = samples.filter((s) => t - s.t < 80);
    },
    get() {
      if (samples.length < 2) return 0;
      const a = samples[0];
      const b = samples[samples.length - 1];
      return ((b.x - a.x) / Math.max(1, b.t - a.t)) * 1000;
    },
    reset() {
      samples = [];
    },
  };
}

// ---------- haptyka ----------
export type Haptic = "tap" | "snap" | "success" | "warn" | "error";
const PATTERN: Record<Haptic, number | number[]> = { tap: 8, snap: 12, success: [10, 50, 16], warn: [18, 70, 18], error: [28, 50, 28, 50, 28] };
let iosSwitch: HTMLLabelElement | null = null;

/**
 * Android: Vibration API. iPhone (Safari 18+): stuknięcie przełącznika `<input switch>`, które system potwierdza haptyką.
 * Działa tylko w odpowiedzi na dotyk — poza nim przeglądarka po prostu nic nie robi.
 */
export function haptic(kind: Haptic = "tap") {
  if (typeof navigator === "undefined") return;
  if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
    navigator.vibrate(PATTERN[kind]);
    return;
  }
  if (!/iPhone|iPad/.test(navigator.userAgent)) return;
  if (!iosSwitch) {
    iosSwitch = document.createElement("label");
    iosSwitch.setAttribute("aria-hidden", "true");
    iosSwitch.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    iosSwitch.append(input);
    document.body.append(iosSwitch);
  }
  iosSwitch.click();
  if (kind === "success" || kind === "error") setTimeout(() => iosSwitch?.click(), 90);
}
