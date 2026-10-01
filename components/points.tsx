"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";

/**
 * Point. A small agent, drawn as one flat shape with two eyes cut out of it.
 * Give it a shape and a mood, and it blinks, looks around, thinks, talks,
 * listens, naps and bounces on its own. One file, no dependencies beyond React.
 *
 *   <Point shape="clover" mood={thinking ? "thinking" : "idle"} />
 *
 * The eyes are real holes, so it sits on any background. Everything moves on
 * springs, so switching mood or shape mid motion never jumps.
 *
 * Fragms 1.0.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export const POINT_SHAPES = [
  "circle",
  "pebble",
  "squircle",
  "cookie",
  "clover",
  "flower",
  "sunny",
  "gumdrop",
  "star",
  "heart",
] as const;

export const POINT_MOODS = [
  "idle",
  "listening",
  "thinking",
  "talking",
  "happy",
  "surprised",
  "sleepy",
  "sad",
] as const;

/** Flat tones that sit well next to each other. Ink follows the text colour. */
export const POINT_COLORS = {
  ink: "currentColor",
  orange: "#ff6a3d",
  yellow: "#ffbe1a",
  green: "#22b573",
  teal: "#12b5b0",
  blue: "#3d7bff",
  violet: "#8b5cf6",
  pink: "#ff5fa2",
  red: "#f0433a",
} as const;

export type PointShape = (typeof POINT_SHAPES)[number];
export type PointMood = (typeof POINT_MOODS)[number];
/** Where it looks. The pointer, anywhere it likes, or a direction from -1 to 1. */
export type PointLook = "pointer" | "around" | [x: number, y: number];

export type PointProps = {
  shape?: PointShape;
  /** Any CSS colour. Left out, it takes the text colour. */
  color?: string;
  mood?: PointMood;
  look?: PointLook;
  /** How lively it is, from 0 for calm to 2 for a lot. */
  energy?: number;
  /** Loudness from 0 to 1 while talking. Left out, it makes up its own. */
  level?: number | (() => number);
  /** Width in pixels. Left out, it is 120, or whatever --point-size says. */
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/* ------------------------------------------------------------------------ */
/* Shapes. Each is a radius around the centre, so any two can morph.          */
/* ------------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const STEPS = 120;
const R = 40;

// A heart has no neat formula around its middle, so the classic heart curve is
// traced once, read back as a radius per angle, and softened a little.
const HEART_BINS = 720;
const HEART = (() => {
  const table = new Float32Array(HEART_BINS);
  const middle = 1;
  for (let i = 0; i < 6000; i++) {
    const t = (i / 6000) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    );
    const angle = (Math.atan2(y - middle, x) + Math.PI * 2) % (Math.PI * 2);
    const bin = Math.round((angle / (Math.PI * 2)) * HEART_BINS) % HEART_BINS;
    table[bin] = Math.max(table[bin], Math.hypot(x, y - middle));
  }
  // Fill any gaps from the neighbours, then smooth the tip and the dip.
  for (let i = 0; i < HEART_BINS; i++) {
    if (table[i]) continue;
    let back = 1;
    while (!table[(i - back + HEART_BINS) % HEART_BINS]) back++;
    let ahead = 1;
    while (!table[(i + ahead) % HEART_BINS]) ahead++;
    const a = table[(i - back + HEART_BINS) % HEART_BINS];
    const b = table[(i + ahead) % HEART_BINS];
    table[i] = a + ((b - a) * back) / (back + ahead);
  }
  const soft = new Float32Array(HEART_BINS);
  const reach = 6;
  for (let i = 0; i < HEART_BINS; i++) {
    let sum = 0;
    for (let k = -reach; k <= reach; k++)
      sum += table[(i + k + HEART_BINS) % HEART_BINS];
    soft[i] = sum / (reach * 2 + 1);
  }
  return soft;
})();

function heart(a: number) {
  const at = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * HEART_BINS;
  const i = Math.floor(at);
  const f = at - i;
  return HEART[i % HEART_BINS] * (1 - f) + HEART[(i + 1) % HEART_BINS] * f;
}

const petal = (a: number, count: number, sharp: number) =>
  Math.pow(0.5 + 0.5 * Math.cos(count * a), sharp);

const OUTLINE: Record<PointShape, (a: number) => number> = {
  circle: () => 1,
  pebble: (a) => 1 + 0.06 * Math.sin(a) + 0.05 * Math.cos(2 * a),
  squircle: (a) =>
    Math.pow(Math.abs(Math.cos(a)) ** 4 + Math.abs(Math.sin(a)) ** 4, -1 / 4),
  cookie: (a) => 1 + 0.05 * Math.cos(9 * a),
  clover: (a) => 0.8 + 0.24 * Math.abs(Math.cos(2 * (a + Math.PI / 4))) ** 0.6,
  flower: (a) => 0.84 + 0.2 * petal(a, 6, 0.9),
  sunny: (a) => 0.92 + 0.13 * petal(a, 10, 2.4),
  gumdrop: (a) => 1 + 0.12 * Math.cos(3 * (a + Math.PI / 2)),
  // Five soft points, one straight up, with round tips so it still feels friendly.
  star: (a) => 0.74 + 0.38 * petal(a + Math.PI / 2, 5, 1.35),
  heart,
};

// Every shape is scaled to the same weight, so none looks bigger than another.
const WEIGHT = Object.fromEntries(
  POINT_SHAPES.map((shape) => {
    let sum = 0;
    for (let i = 0; i < STEPS; i++)
      sum += OUTLINE[shape]((i / STEPS) * TAU) ** 2;
    return [shape, 1 / Math.sqrt(sum / STEPS)];
  }),
) as Record<PointShape, number>;

/** Shapes with a clear up, and how many ways round they look the same. */
const UPRIGHT: Partial<Record<PointShape, number>> = {
  heart: 1,
  pebble: 1,
  gumdrop: 3,
  star: 5,
};

const outline = (shape: PointShape, a: number) =>
  OUTLINE[shape](a) * WEIGHT[shape];

function path(radii: (index: number, angle: number) => number) {
  let d = "";
  for (let i = 0; i < STEPS; i++) {
    const a = (i / STEPS) * TAU;
    const r = radii(i, a);
    d += `${i ? "L" : "M"}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  }
  return d + "Z";
}

/** The outline of a shape as an SVG path centred on 0 0, for icons. */
export function pointShapePath(shape: PointShape, radius = 10) {
  return path((_, a) => radius * outline(shape, a));
}

/* ------------------------------------------------------------------------ */
/* Moods. The eyes carry them. Each eye is one stroke that bends and turns,   */
/* so a pill can become an arc, a dot or a line without a cut.                */
/* ------------------------------------------------------------------------ */

type Pose = {
  /** Length of each eye stroke, and how thick it is. */
  eyeLen: number;
  eyeW: number;
  /** Angle of the stroke in degrees. 90 stands it up. */
  eyeRot: number;
  /** Negative arches it upwards, into a happy eye. */
  eyeBend: number;
  gap: number;
  eyeY: number;
  /** Narrows the right eye, for a thinking face. */
  squint: number;
  scale: number;
  lean: number;
  wobble: number;
  spin: number;
  breathe: number;
};

const BASE: Pose = {
  eyeLen: 9,
  eyeW: 6.5,
  eyeRot: 104,
  eyeBend: 0,
  gap: 8.5,
  eyeY: -10,
  squint: 0,
  scale: 1,
  lean: 0,
  wobble: 0.25,
  spin: 0.05,
  breathe: 1,
};

const POSES: Record<PointMood, Partial<Pose>> = {
  idle: {},
  listening: { eyeLen: 11.5, lean: 6 },
  thinking: { eyeLen: 6, squint: 0.7, spin: 0.6, wobble: 0.45 },
  talking: { wobble: 0.55 },
  happy: {
    eyeLen: 10,
    eyeW: 4.2,
    eyeRot: 0,
    eyeBend: -5,
    gap: 9.5,
    spin: 0.3,
    wobble: 0.45,
  },
  surprised: { eyeLen: 0, eyeW: 10, gap: 10, scale: 1.05 },
  sleepy: {
    eyeLen: 9,
    eyeW: 3.6,
    eyeRot: 0,
    eyeBend: 1.8,
    gap: 9,
    eyeY: -6,
    scale: 0.97,
    lean: -3,
    wobble: 0.1,
    spin: 0,
    breathe: 2.6,
  },
  sad: {
    eyeLen: 3,
    eyeW: 6.5,
    eyeY: -5,
    scale: 0.93,
    wobble: 0.1,
    spin: 0,
  },
};

type Motion = {
  /** Seconds between hops, and how hard each one is. */
  hop?: [every: number, power: number];
  /** A hop on arrival. */
  enter?: number;
  /** A fixed place to look, which wins over the look prop. */
  gaze?: [number, number];
};

const MOTIONS: Record<PointMood, Motion> = {
  idle: {},
  listening: { hop: [1.7, 70], enter: 90 },
  thinking: { gaze: [0.7, -0.8] },
  talking: { hop: [2.4, 80] },
  happy: { hop: [0.62, 230], enter: 260 },
  surprised: { enter: 340 },
  sleepy: { gaze: [0, 0.3] },
  sad: { gaze: [0, 0.6] },
};

// How springy each part is. Stiffness, then damping.
const SPRING: Partial<Record<keyof Pose, [number, number]>> = {
  eyeLen: [320, 22],
  eyeW: [300, 22],
  eyeRot: [220, 20],
  eyeBend: [260, 20],
  eyeY: [260, 20],
};
const SPRING_DEFAULT: [number, number] = [170, 14];

const KEYS = Object.keys(BASE) as (keyof Pose)[];
const EYE: (keyof Pose)[] = ["eyeLen", "eyeW", "eyeRot", "eyeBend"];

/** One eye, as a stroke. Round caps turn a short stroke into a pill. */
function eyePath(length: number, bend: number) {
  const half = Math.max(0.01, length / 2);
  return `M${-half} 0Q0 ${(bend * 2).toFixed(2)} ${half} 0`;
}

// Syllables and pauses, for when no level is given.
function chatter(t: number) {
  const phrase = Math.sin(t * 1.7) + Math.sin(t * 0.63 + 1) > -0.7 ? 1 : 0.05;
  const syllable = 0.5 + 0.5 * Math.sin(t * 13 + 2 * Math.sin(t * 3.1));
  return phrase * syllable;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function Point({
  shape = "circle",
  color = "currentColor",
  mood = "idle",
  look = "pointer",
  energy = 1,
  level,
  size,
  className = "",
  style,
}: PointProps) {
  const svg = useRef<SVGSVGElement>(null);
  const mask = `point-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

  // The frame loop reads the latest props from here.
  const live = useRef({ shape, mood, look, energy, level });
  useEffect(() => {
    live.current = { shape, mood, look, energy, level };
  });

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const part = <T extends Element>(name: string) =>
      root.querySelector(`[data-part="${name}"]`) as T;
    const body = part<SVGPathElement>("body");
    const figure = part<SVGGElement>("figure");
    const face = part<SVGGElement>("face");
    const eyes = [part<SVGGElement>("eye-l"), part<SVGGElement>("eye-r")];
    const strokes = eyes.map((eye) => eye.firstElementChild as SVGPathElement);

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const random = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

    const start = live.current;
    const pose: Pose = { ...BASE, ...POSES[start.mood] };
    const speed = Object.fromEntries(KEYS.map((k) => [k, 0])) as Pose;

    let shapeNow = start.shape;
    const from = new Float32Array(STEPS);
    const last = new Float32Array(STEPS);
    for (let i = 0; i < STEPS; i++)
      last[i] = from[i] = outline(shapeNow, (i / STEPS) * TAU);
    let morph = 1;
    let morphV = 0;
    let spin = 0;

    let mood = start.mood;
    let hopY = 0;
    let hopV = 0;
    let squash = 0;
    let squashV = 0;
    let nextHop = 0;

    let lookX = 0;
    let lookY = 0;
    let lookVX = 0;
    let lookVY = 0;
    let aroundX = 0;
    let aroundY = 0;
    let nextGlance = 0;
    let pointer: { x: number; y: number } | null = null;

    let blinkAt = -1;
    // Changing what kind of eye it has happens behind a blink, the way an
    // animator would swap it, so a pill never visibly bends into an arc.
    let eyeKind = "";
    let swapAt = -1;
    let nextBlink = random(0.8, 2.5);
    let pokedUntil = -1;

    const hop = (power: number) => {
      const energy = clamp(live.current.energy, 0, 2);
      if (reduced || hopY < -2 || energy === 0) return;
      const scaled = power * Math.sqrt(energy);
      hopV = -scaled;
      squashV -= scaled * 0.009;
    };

    const onPointer = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
    };
    const onPoke = () => {
      pokedUntil = performance.now() / 1000 + 0.9;
      hop(250);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    root.addEventListener("pointerdown", onPoke);

    let frame = 0;
    let then = performance.now();

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - then) / 1000);
      then = now;
      const t = now / 1000;
      const props = live.current;
      const energy = clamp(props.energy, 0, 2);

      if (props.mood !== mood) {
        mood = props.mood;
        const enter = MOTIONS[mood].enter;
        if (enter) hop(enter);
        if (mood === "sad") squashV += 1.2;
        nextHop = t + 0.4;
      }

      // A new shape morphs from wherever the outline is right now.
      if (props.shape !== shapeNow) {
        from.set(last);
        shapeNow = props.shape;
        morph = 0;
        morphV = 0;
      }
      morphV += (190 * (1 - morph) - 15 * morphV) * dt;
      morph = clamp(morph + morphV * dt, -0.2, 1.3);

      const poked = t < pokedUntil;
      const target: Pose = { ...BASE, ...POSES[poked ? "happy" : mood] };

      // Talking bounces the eyes and swells the body with the voice.
      let voice = 0;
      if (mood === "talking" && !poked) {
        const given = props.level;
        voice = clamp(
          typeof given === "function" ? given() : (given ?? chatter(t)),
          0,
          1,
        );
        target.eyeY -= voice * 3.5;
        target.eyeLen -= voice * 2;
        target.scale += voice * 0.05;
      }
      target.wobble *= energy;
      target.spin *= energy;
      if (reduced) {
        target.wobble = 0;
        target.spin = 0;
      }

      const kind = `${target.eyeRot}|${target.eyeBend}|${target.eyeLen > 0.5}`;
      if (kind !== eyeKind) {
        const far =
          Math.abs(target.eyeRot - pose.eyeRot) > 30 ||
          Math.abs(target.eyeBend - pose.eyeBend) > 2.5 ||
          target.eyeLen > 0.5 !== pose.eyeLen > 0.5;
        if (eyeKind && far && !reduced) {
          blinkAt = t;
          swapAt = t + 0.08;
        }
        eyeKind = kind;
      }
      if (swapAt >= 0 && t >= swapAt) {
        for (const key of EYE) {
          pose[key] = target[key];
          speed[key] = 0;
        }
        swapAt = -1;
      }

      for (const key of KEYS) {
        if (swapAt >= 0 && EYE.includes(key)) continue;
        const [k, c] = SPRING[key] ?? SPRING_DEFAULT;
        speed[key] += (k * (target[key] - pose[key]) - c * speed[key]) * dt;
        pose[key] += speed[key] * dt;
      }

      // Hops fall back down, land and squash, then wobble still.
      const rhythm = MOTIONS[mood].hop;
      if (rhythm && !poked && t > nextHop) {
        hop(rhythm[1] * random(0.8, 1.15));
        nextHop = t + rhythm[0] * random(0.8, 1.3);
      }
      if (hopY < 0 || hopV < 0) {
        hopV += 1900 * dt;
        hopY += hopV * dt;
        if (hopY >= 0) {
          squashV += hopV * 0.011;
          hopY = 0;
          hopV = 0;
        }
      }
      squashV += (-430 * squash - 15 * squashV) * dt;
      squash = clamp(squash + squashV * dt, -0.3, 0.3);

      // Where it looks. The eyes travel across the body to get there.
      const gaze = MOTIONS[mood].gaze;
      let tx = 0;
      let ty = 0;
      if (poked) {
        tx = 0;
        ty = 0;
      } else if (gaze) {
        [tx, ty] = gaze;
        tx += Math.sin(t * 1.3) * 0.08;
      } else if (Array.isArray(props.look)) {
        [tx, ty] = props.look;
      } else if (props.look === "pointer" && pointer) {
        const box = root.getBoundingClientRect();
        const dx = pointer.x - (box.left + box.width / 2);
        const dy = pointer.y - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, distance / 240);
        tx = (dx / distance) * reach;
        ty = (dy / distance) * reach;
      } else {
        if (t > nextGlance) {
          aroundX = random(-0.8, 0.8);
          aroundY = random(-0.6, 0.4);
          nextGlance = t + random(0.6, 2.6) / Math.max(0.5, energy);
        }
        tx = aroundX;
        ty = aroundY;
      }
      lookVX += (280 * (clamp(tx, -1, 1) - lookX) - 26 * lookVX) * dt;
      lookVY += (280 * (clamp(ty, -1, 1) - lookY) - 26 * lookVY) * dt;
      lookX += lookVX * dt;
      lookY += lookVY * dt;

      // Blinks, now and then twice.
      if (t >= nextBlink) {
        blinkAt = t;
        nextBlink = t + (Math.random() < 0.2 ? 0.26 : random(2, 5.5));
      }
      const blink =
        blinkAt >= 0 && t - blinkAt < 0.16
          ? Math.sin((Math.PI * (t - blinkAt)) / 0.16)
          : 0;

      // Outline.
      // Round shapes turn freely. Shapes with an up settle back upright.
      const turns = UPRIGHT[shapeNow];
      if (turns) {
        const step = TAU / turns;
        spin += (Math.round(spin / step) * step - spin) * Math.min(1, dt * 5);
      } else {
        spin += pose.spin * dt;
      }
      const breath =
        1 + 0.012 * pose.breathe * Math.sin((t * TAU) / (2.6 + pose.breathe));
      const wobble = pose.wobble;
      body.setAttribute(
        "d",
        path((i, a) => {
          const shaped =
            from[i] * (1 - morph) + outline(shapeNow, a - spin) * morph;
          last[i] = shaped;
          const jelly =
            wobble *
            (0.026 * Math.sin(3 * a + t * 2.3) +
              0.018 * Math.sin(5 * a - t * 1.9) +
              0.012 * Math.sin(2 * a + t * 3.1));
          return R * pose.scale * breath * (shaped + jelly);
        }),
      );

      const sy = 1 - squash;
      const sx = 1 + squash * 0.75;
      const lean = pose.lean + lookX * 4;
      figure.setAttribute(
        "transform",
        `translate(0 ${hopY.toFixed(2)}) translate(0 ${R}) rotate(${lean.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(0 ${-R})`,
      );

      const reach = 0.6 + 0.4 * Math.min(1, energy);
      face.setAttribute(
        "transform",
        `translate(${(lookX * 15 * reach).toFixed(2)} ${(pose.eyeY + lookY * 12 * reach).toFixed(2)})`,
      );
      eyes.forEach((eye, side) => {
        const sign = side ? 1 : -1;
        const squint = side ? 1 - pose.squint * 0.6 : 1;
        eye.setAttribute(
          "transform",
          `translate(${(sign * pose.gap).toFixed(2)} 0) scale(1 ${(squint * (1 - 0.85 * blink)).toFixed(3)}) rotate(${pose.eyeRot.toFixed(2)})`,
        );
        strokes[side].setAttribute(
          "d",
          eyePath(Math.max(0, pose.eyeLen), pose.eyeBend),
        );
        strokes[side].setAttribute(
          "stroke-width",
          Math.max(1, pose.eyeW).toFixed(2),
        );
      });
    };

    const run = () => {
      cancelAnimationFrame(frame);
      then = performance.now();
      frame = requestAnimationFrame(tick);
    };
    // Nothing moves while it is off screen.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) run();
      else cancelAnimationFrame(frame);
    });
    observer.observe(root);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      root.removeEventListener("pointerdown", onPoke);
    };
  }, []);

  // The first frame, drawn on the server so nothing pops in.
  const first = { ...BASE, ...POSES[mood] };

  return (
    <svg
      ref={svg}
      viewBox="-60 -72 120 120"
      aria-hidden="true"
      data-mood={mood}
      data-shape={shape}
      className={className}
      style={{
        display: "block",
        height: "auto",
        overflow: "visible",
        width: size ?? "var(--point-size, 120px)",
        ...style,
      }}
    >
      <defs>
        <mask
          id={mask}
          maskUnits="userSpaceOnUse"
          x="-100"
          y="-140"
          width="200"
          height="240"
        >
          <g data-part="figure">
            <path data-part="body" d={pointShapePath(shape, R)} fill="white" />
            <g
              data-part="face"
              transform={`translate(0 ${first.eyeY})`}
              fill="none"
              stroke="black"
              strokeLinecap="round"
            >
              {[-1, 1].map((sign) => (
                <g
                  key={sign}
                  data-part={sign < 0 ? "eye-l" : "eye-r"}
                  transform={`translate(${sign * first.gap} 0) rotate(${first.eyeRot})`}
                >
                  <path
                    d={eyePath(first.eyeLen, first.eyeBend)}
                    strokeWidth={first.eyeW}
                  />
                </g>
              ))}
            </g>
          </g>
        </mask>
      </defs>

      <rect
        x="-100"
        y="-140"
        width="200"
        height="240"
        fill={color}
        mask={`url(#${mask})`}
        style={{ transition: "fill 400ms ease" }}
      />
    </svg>
  );
}
