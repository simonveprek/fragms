"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Aura. A glow on the inside edge of a shape, swelling with a voice level.
 * One file, no dependencies beyond React. Use it three ways.
 *
 *   <Aura level={level}><Card /></Aura>        around any element
 *   <Aura level={level} className="..." />     as a shape of its own
 *   <Aura fixed level={level} />               across the whole screen
 *
 * Fragms 1.0.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type AuraColors = [string, string, string, string];

export const AURA_PALETTES = {
  aurora: ["#2b4bff", "#a23bff", "#ff2d55", "#ffb020"],
  ocean: ["#00c2ff", "#2563eb", "#22d3ee", "#34d399"],
  ember: ["#ff3d00", "#ff8a00", "#ffd000", "#ff2d75"],
  mono: ["#ffffff", "#9ca3af", "#f5f5f5", "#d4d4d8"],
} satisfies Record<string, AuraColors>;

export type AuraPalette = keyof typeof AURA_PALETTES;

export type AuraProps = {
  /** Loudness from 0 to 1. Pass a function to have it read every frame. */
  level?: number | (() => number);
  palette?: AuraPalette | AuraColors;
  /** How far the glow reaches. 1 is the default. */
  intensity?: number;
  /** How fast the colours travel round the edge. 0 holds them still. */
  speed?: number;
  /** Corner radius in pixels. Left out, it follows the wrapper's own radius. */
  radius?: number;
  /** Cover the viewport instead of wrapping something. Clicks pass through. */
  fixed?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_level;
uniform float u_radius;
uniform float u_intensity;
uniform float u_unit;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;

const float TAU = 6.2831853;

// Signed distance to a rounded box. Negative inside.
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

vec3 palette(float t) {
  t = fract(t) * 4.0;
  float f = smoothstep(0.0, 1.0, fract(t));
  if (t < 1.0) return mix(u_c0, u_c1, f);
  if (t < 2.0) return mix(u_c1, u_c2, f);
  if (t < 3.0) return mix(u_c2, u_c3, f);
  return mix(u_c3, u_c0, f);
}

void main() {
  vec2 p = gl_FragCoord.xy - 0.5 * u_res;
  float r = min(u_radius, 0.5 * min(u_res.x, u_res.y));
  float inside = -box(p, 0.5 * u_res, r);

  // Position round the edge, 0 to 1, so colour and thickness can travel.
  float a = atan(p.y / u_res.y, p.x / u_res.x) / TAU + 0.5;

  // Whole number frequencies keep the wobble seamless where the loop closes.
  float wave = 0.5
    + 0.27 * sin(TAU * (a * 2.0 + u_time * 0.11))
    + 0.15 * sin(TAU * (a * 3.0 - u_time * 0.17) + 1.3)
    + 0.08 * sin(TAU * (a * 5.0 + u_time * 0.23) + 2.1);

  float unit = u_unit;
  float reach = (8.0 + 46.0 * u_level) * (0.45 + 1.1 * wave) * u_intensity * unit;

  float bleed = exp(-inside / max(reach, 0.001));
  float rim = exp(-inside / ((1.6 + 3.2 * u_level) * unit));

  vec3 col = mix(
    palette(a + u_time * 0.05 + wave * 0.12),
    palette(a * 2.0 - u_time * 0.035 + 0.37),
    0.35
  );
  col = mix(col, vec3(1.0), rim * 0.6);

  float alpha = bleed * (0.28 + 0.72 * u_level) + rim * (0.45 + 0.55 * u_level);
  alpha = clamp(alpha * u_intensity, 0.0, 1.0) * smoothstep(-1.0, 0.75, inside);

  gl_FragColor = vec4(col * alpha, alpha);
}
`;

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.replace(/./g, "$&$&") : value;
  const int = Number.parseInt(full, 16);
  return [
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  ];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function Aura({
  level = 0,
  palette = "aurora",
  intensity = 1,
  speed = 1,
  radius,
  fixed = false,
  className,
  style,
  children,
}: AuraProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<HTMLSpanElement>(null);
  const latest = useRef({ level, palette, intensity, speed, radius });

  // Props are read by the render loop, so changing them never restarts it.
  useEffect(() => {
    latest.current = { level, palette, intensity, speed, radius };
  });

  useEffect(() => {
    const host = wrapper.current;
    const element = canvas.current;
    if (!host || !element) return;

    const gl = element.getContext("webgl", { alpha: true, antialias: false });
    const vertex = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl && gl.createProgram();
    if (!gl || !vertex || !fragment || !program) return;

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    // WebGL is running, so the plain CSS ring underneath is no longer needed.
    if (fallback.current) fallback.current.style.display = "none";
    host.dataset.aura = "webgl";

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const u = {
      res: uniform("u_res"),
      time: uniform("u_time"),
      level: uniform("u_level"),
      radius: uniform("u_radius"),
      intensity: uniform("u_intensity"),
      unit: uniform("u_unit"),
      colors: [
        uniform("u_c0"),
        uniform("u_c1"),
        uniform("u_c2"),
        uniform("u_c3"),
      ],
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    let dpr = 1;
    let cornerRadius = 0;
    let unit = 1;
    const measure = () => {
      // Phones get 1.5x. A soft glow looks the same and costs half as much.
      const cap = window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2;
      dpr = Math.min(window.devicePixelRatio || 1, cap);
      const width = Math.max(1, Math.round(element.clientWidth * dpr));
      const height = Math.max(1, Math.round(element.clientHeight * dpr));
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
        gl.viewport(0, 0, width, height);
      }
      cornerRadius =
        Number.parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0;
      // The glow grows with the element, within limits. A pill stays delicate
      // and a whole screen keeps the light at its edge instead of flooding it.
      const shortest = Math.min(element.clientWidth, element.clientHeight);
      unit = Math.min(1.5, Math.max(0.7, shortest / 320)) * dpr;
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(host);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    watcher.observe(host);

    let frame = 0;
    let previous = performance.now();
    let time = 0;
    let smooth = 0;
    let count = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      if (!visible || document.hidden) return;

      const props = latest.current;
      // Corner radius can change without the size changing, so check in now and then.
      if (count++ % 30 === 0) measure();

      const raw =
        typeof props.level === "function" ? props.level() : props.level;
      const target = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0));
      // Quick up, easing down. Tied to elapsed time, so it feels the same at 60
      // and at 120 frames a second.
      smooth +=
        (target - smooth) * (1 - Math.exp(-(target > smooth ? 16 : 4) * delta));
      // At rest the edge still breathes a little.
      const breath = 0.06 + 0.03 * Math.sin(now / 1100);
      if (!still) time += delta * props.speed * 0.85;

      const colors =
        typeof props.palette === "string"
          ? AURA_PALETTES[props.palette]
          : props.palette;
      colors.forEach((hex, i) => gl.uniform3f(u.colors[i], ...rgb(hex)));

      gl.uniform2f(u.res, element.width, element.height);
      gl.uniform1f(u.time, time);
      gl.uniform1f(u.level, Math.max(smooth, breath));
      gl.uniform1f(u.radius, (props.radius ?? cornerRadius) * dpr);
      gl.uniform1f(u.intensity, props.intensity);
      gl.uniform1f(u.unit, unit);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      watcher.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  const colors = typeof palette === "string" ? AURA_PALETTES[palette] : palette;
  const layer: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    borderRadius: "inherit",
    pointerEvents: "none",
  };

  return (
    <div
      ref={wrapper}
      className={className}
      style={{
        ...(fixed
          ? { position: "fixed", inset: 0, zIndex: 50, pointerEvents: "none" }
          : { position: "relative", isolation: "isolate" }),
        ...style,
      }}
    >
      {children}
      {/* Shown only where WebGL is unavailable. */}
      <span
        ref={fallback}
        aria-hidden="true"
        style={{
          ...layer,
          boxShadow: `inset 0 0 0 1px ${colors[0]}, inset 0 0 28px ${colors[1]}`,
          opacity: 0.6,
        }}
      />
      <canvas ref={canvas} aria-hidden="true" style={layer} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Level sources. Each one gives you a function to hand to `level`.          */
/* ------------------------------------------------------------------------ */

/** A believable speech rhythm, for demos, previews and loading states. */
export function demoLevel(now: number = performance.now()) {
  const t = now / 1000;
  const phrase = Math.min(1, Math.max(0, (Math.sin(t * 0.7) + 0.5) * 1.9));
  const syllable = 0.5 + 0.5 * Math.sin(t * 4.4 + 1.4 * Math.sin(t * 1.3));
  const flutter = 0.08 * Math.sin(t * 10.0);
  return Math.min(1, Math.max(0, phrase * (0.3 + 0.7 * syllable + flutter)));
}

/**
 * Text to speech through the browser. The speech API never exposes loudness,
 * so the level is rebuilt from the word boundaries it does report.
 */
export function useSpeech() {
  const voice = useRef({ speaking: false, wordAt: 0, boundaryAt: 0 });
  const [speaking, setSpeaking] = useState(false);
  const [charIndex, setCharIndex] = useState(-1);

  const level = useCallback(() => {
    const state = voice.current;
    if (!state.speaking) return 0;
    const now = performance.now();
    // Some voices report no boundaries at all. They still get a living edge.
    if (now - state.boundaryAt > 900) return 0.2 + 0.8 * demoLevel(now);
    const word = Math.exp(-(now - state.wordAt) / 190);
    return Math.min(1, 0.22 + 0.78 * word * (0.8 + 0.2 * Math.sin(now / 38)));
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    voice.current.speaking = false;
    setSpeaking(false);
    setCharIndex(-1);
  }, []);

  const speak = useCallback(
    (text: string, options?: { rate?: number; pitch?: number }) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window))
        return false;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options?.rate ?? 1;
      utterance.pitch = options?.pitch ?? 1;
      utterance.onstart = () => {
        voice.current = {
          speaking: true,
          wordAt: performance.now(),
          boundaryAt: performance.now(),
        };
        setSpeaking(true);
      };
      utterance.onboundary = (event) => {
        const now = performance.now();
        voice.current.wordAt = now;
        voice.current.boundaryAt = now;
        setCharIndex(event.charIndex);
      };
      const finish = () => {
        voice.current.speaking = false;
        setSpeaking(false);
        setCharIndex(-1);
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      window.speechSynthesis.speak(utterance);
      return true;
    },
    [],
  );

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  return { level, speak, stop, speaking, charIndex };
}

/** Live loudness from the microphone. Asks for permission when you call start. */
export function useMic() {
  const audio = useRef<{
    context: AudioContext;
    analyser: AnalyserNode;
    stream: MediaStream;
    samples: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const [status, setStatus] = useState<"idle" | "live" | "blocked">("idle");

  const stop = useCallback(() => {
    const current = audio.current;
    audio.current = null;
    if (!current) return;
    current.stream.getTracks().forEach((track) => track.stop());
    void current.context.close();
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      audio.current = {
        context,
        analyser,
        stream,
        samples: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      };
      setStatus("live");
    } catch {
      setStatus("blocked");
    }
  }, []);

  const level = useCallback(() => {
    const current = audio.current;
    if (!current) return 0;
    current.analyser.getByteTimeDomainData(current.samples);
    let sum = 0;
    for (const sample of current.samples) sum += ((sample - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / current.samples.length) * 5);
  }, []);

  useEffect(() => stop, [stop]);

  return { level, start, stop, status };
}
