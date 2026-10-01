"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Ghost. An AI cursor that works your interface for real. Give it steps and it
 * glides from element to element, highlights what it is looking at, clicks,
 * and types, while a small tag says what it is doing. Clicks and typing reach
 * the real elements, so your UI answers the way it would for a person.
 * One file, needs React and Framer Motion. No Tailwind required.
 *
 *   <Ghost steps={[
 *     { target: "#search", action: "type", text: "May", say: "Searching" },
 *     { target: "#send", action: "click", say: "Sending it" },
 *   ]}>
 *     <App />
 *   </Ghost>
 *
 * Fragms 1.0.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type GhostStep = {
  /** A CSS selector inside the Ghost. Left out, the cursor stays where it is. */
  target?: string;
  action?: "move" | "click" | "type" | "wait";
  /** What to type, for the type action. */
  text?: string;
  /** A few words in the tag while it does this step. */
  say?: string;
  /** How long to linger afterwards, in milliseconds. */
  pause?: number;
  /** Where on the element to aim, from 0 to 1 across and down. */
  at?: [number, number];
};

export type GhostProps = {
  steps: GhostStep[];
  children: ReactNode;
  name?: string;
  color?: string;
  playing?: boolean;
  loop?: boolean;
  /** 1 is a calm human pace. 2 is twice as quick. */
  speed?: number;
  /** Outlines the element it is working on. */
  highlight?: boolean;
  /** Shows what it says in its tag. */
  bubbles?: boolean;
  /** Called before every run, so you can put your UI back how it started. */
  onRestart?: () => void;
  onStep?: (index: number) => void;
  className?: string;
  style?: CSSProperties;
};

type Box = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

const STOP = Symbol("stop");

const PILL: CSSProperties = {
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 9999,
  padding: "4px 10px 4px 8px",
  fontSize: 12,
  lineHeight: 1,
  whiteSpace: "nowrap",
  color: "#ffffff",
  boxShadow: "0 10px 20px -8px rgba(0, 0, 0, 0.35)",
};

// Styled inline, so it works with or without Tailwind.
const LAYER: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  willChange: "transform",
};
const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function Ghost({
  steps,
  children,
  name = "Simmy",
  color = "#3d7bff",
  playing = true,
  loop = true,
  speed = 1,
  highlight = true,
  bubbles = true,
  onRestart,
  onStep,
  className = "",
  style,
}: GhostProps) {
  const root = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);

  const [box, setBox] = useState<Box | null>(null);
  const [say, setSay] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const [ripples, setRipples] = useState<
    { id: number; x: number; y: number }[]
  >([]);
  const [inView, setInView] = useState(false);
  const seen = useRef(false);
  useEffect(() => {
    seen.current = inView;
  }, [inView]);
  const sizer = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<number | null>(null);

  // Where the cursor is, and how it leans, read by the drawing loop.
  const pos = useRef<Point>({ x: -1, y: -1 });
  const lean = useRef(0);

  // The run reads the latest props from here.
  const live = useRef({ steps, speed, loop, onRestart, onStep });
  useEffect(() => {
    live.current = { steps, speed, loop, onRestart, onStep };
  });

  // The tag grows to fit what it says. The copy is measured whenever it changes.
  useEffect(() => {
    const element = sizer.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setPill(element.offsetWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Only works while it can be seen, so it never types into a page you left.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Draws the cursor where it is, and lets the tag trail a little behind.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0;
    const follow = { x: 0, y: 0 };
    let flip = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!seen.current || document.hidden) return;
      if (pos.current.x < 0) {
        pos.current = {
          x: element.clientWidth * 0.82,
          y: element.clientHeight * 0.82,
        };
        follow.x = pos.current.x;
        follow.y = pos.current.y;
      }
      const bob = Math.sin(now / 900) * 1.5;
      const { x, y } = pos.current;
      follow.x += (x - follow.x) * 0.2;
      follow.y += (y - follow.y) * 0.2;
      lean.current *= 0.9;
      if (cursor.current)
        cursor.current.style.transform = `translate(${x.toFixed(1)}px, ${(y + bob).toFixed(1)}px) rotate(${lean.current.toFixed(1)}deg)`;
      if (tag.current) {
        // Near the right edge the tag swaps to the left of the cursor.
        const width = tag.current.offsetWidth;
        flip +=
          ((follow.x + 16 + width > element.clientWidth + 24 ? 1 : 0) - flip) *
          0.15;
        const left = follow.x + 16 - flip * (width + 24);
        tag.current.style.transform = `translate(${left.toFixed(1)}px, ${(follow.y + 22 + bob).toFixed(1)}px)`;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  // The run itself. Starts over whenever it comes back into view.
  useEffect(() => {
    const element = root.current;
    if (!playing || !inView || !element) return;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const alive = () => {
      if (cancelled) throw STOP;
    };
    const sleep = (ms: number) =>
      new Promise<void>((done) => {
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms / live.current.speed);
        timers.add(id);
      });

    const place = (target: Element, at: [number, number] = [0.5, 0.5]) => {
      const origin = element.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        box: {
          x: rect.left - origin.left,
          y: rect.top - origin.top,
          w: rect.width,
          h: rect.height,
        },
        point: {
          x: rect.left - origin.left + rect.width * at[0],
          y: rect.top - origin.top + rect.height * at[1],
        },
      };
    };

    // A curved glide, quicker for short hops, with a lean into the turn.
    const glide = (to: Point) =>
      new Promise<void>((done) => {
        const from = { ...pos.current };
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.hypot(dx, dy);
        if (reduced || distance < 2) {
          pos.current = to;
          done();
          return;
        }
        const duration =
          (Math.min(1.1, Math.max(0.42, 0.3 + distance / 900)) * 1000) /
          live.current.speed;
        const bend = Math.min(70, distance * 0.16) * (dx >= 0 ? -1 : 1);
        const nx = -dy / distance;
        const ny = dx / distance;
        const start = performance.now();
        const step = (now: number) => {
          if (cancelled) return done();
          const t = Math.min(1, (now - start) / duration);
          const e = ease(t);
          const arc = Math.sin(Math.PI * e) * bend;
          const next = {
            x: from.x + dx * e + nx * arc,
            y: from.y + dy * e + ny * arc,
          };
          lean.current = Math.max(
            -14,
            Math.min(14, (next.x - pos.current.x) * 0.9),
          );
          pos.current = next;
          if (t < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });

    const click = async (target: Element) => {
      setPressed(true);
      const { x, y } = pos.current;
      setRipples((list) => [...list, { id: performance.now(), x, y }]);
      await sleep(110);
      alive();
      (target as HTMLElement).click();
      setPressed(false);
    };

    const type = async (target: Element, text: string) => {
      const field = target as HTMLInputElement;
      field.focus({ preventScroll: true });
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(field),
        "value",
      )?.set;
      let value = "";
      for (const char of text) {
        await sleep(55 + Math.random() * 90);
        alive();
        value += char;
        setter?.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };

    const run = async () => {
      try {
        do {
          live.current.onRestart?.();
          setBox(null);
          setSay(null);
          await sleep(900);
          alive();
          for (const [index, stepItem] of live.current.steps.entries()) {
            live.current.onStep?.(index);
            const target = stepItem.target
              ? element.querySelector(stepItem.target)
              : null;
            if (stepItem.say !== undefined) setSay(stepItem.say || null);
            if (target) {
              const spot = place(target, stepItem.at);
              if (highlight) setBox(spot.box);
              await glide(spot.point);
              alive();
              if (stepItem.action === "click") await click(target);
              if (stepItem.action === "type")
                await type(target, stepItem.text ?? "");
            }
            alive();
            await sleep(stepItem.pause ?? 550);
            alive();
          }
          // Steps back out of the way, and rests before going again.
          setBox(null);
          setSay(null);
          await glide({
            x: element.clientWidth * 0.82,
            y: element.clientHeight * 0.82,
          });
          alive();
          await sleep(1400);
          alive();
        } while (live.current.loop);
      } catch (error) {
        if (error !== STOP) throw error;
      }
    };
    void run();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setPressed(false);
    };
  }, [playing, inView, highlight]);

  return (
    <div
      ref={root}
      className={className}
      style={{ position: "relative", ...style }}
    >
      {children}

      <div
        aria-hidden="true"
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          zIndex: 20,
        }}
      >
        {/* What it is working on */}
        <AnimatePresence>
          {highlight && box && (
            <motion.div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                borderRadius: 10,
                boxShadow: `0 0 0 1.5px ${color}, 0 0 0 5px color-mix(in oklab, ${color} 18%, transparent)`,
              }}
              initial={{
                opacity: 0,
                x: box.x - 4,
                y: box.y - 4,
                width: box.w + 8,
                height: box.h + 8,
              }}
              animate={{
                opacity: 1,
                x: box.x - 4,
                y: box.y - 4,
                width: box.w + 8,
                height: box.h + 8,
              }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", duration: 0.55, bounce: 0.18 }}
            />
          )}
        </AnimatePresence>

        {/* A ring where it clicked */}
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            style={{
              position: "absolute",
              width: 40,
              height: 40,
              borderRadius: 9999,
              left: ripple.x - 20,
              top: ripple.y - 20,
              border: `2px solid ${color}`,
            }}
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onAnimationComplete={() =>
              setRipples((list) => list.filter((item) => item.id !== ripple.id))
            }
          />
        ))}

        {/* The cursor, with a soft glow in its own colour */}
        <div ref={cursor} style={LAYER}>
          <motion.span
            style={{
              position: "absolute",
              top: -12,
              left: -12,
              width: 36,
              height: 36,
              borderRadius: 9999,
              filter: "blur(10px)",
              background: color,
            }}
            animate={{
              opacity: pressed ? 0.75 : [0.32, 0.5, 0.32],
              scale: pressed ? 1.3 : [0.9, 1.05, 0.9],
            }}
            transition={
              pressed
                ? { duration: 0.15 }
                : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            }
          />
          <motion.svg
            width="22"
            height="24"
            viewBox="0 0 22 24"
            style={{
              position: "relative",
              translate: "-3px -2px",
              filter: `drop-shadow(0 0 6px color-mix(in oklab, ${color} 70%, transparent)) drop-shadow(0 4px 8px rgba(0,0,0,0.3))`,
            }}
            animate={{ scale: pressed ? 0.8 : 1 }}
            transition={{ type: "spring", duration: 0.25, bounce: 0.5 }}
          >
            <path
              d="M3 2.5v16.2c0 .9 1.1 1.3 1.7.6l3.6-4 2.6 5.9c.3.7 1.1 1 1.8.7l1.4-.6c.7-.3 1-1.1.7-1.8l-2.6-5.8h5.4c.9 0 1.3-1.1.6-1.7L4.7 1.8C4 1.2 3 1.6 3 2.5Z"
              fill={color}
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </motion.svg>
        </div>

        {/* Its tag, trailing just behind. Only its width animates, and the
            words crossfade inside, so the text itself never stretches. */}
        <div ref={tag} style={LAYER}>
          <motion.div
            style={{ ...PILL, background: color, overflow: "hidden" }}
            initial={false}
            animate={{ width: pill ?? "auto" }}
            transition={{ type: "spring", duration: 0.45, bounce: 0.12 }}
          >
            <span style={{ fontWeight: 600 }}>{name}</span>
            <AnimatePresence mode="wait" initial={false}>
              {bubbles && say && (
                <motion.span
                  key={say}
                  style={{ color: "rgba(255, 255, 255, 0.8)" }}
                  initial={{ opacity: 0, filter: "blur(3px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(3px)" }}
                  transition={{ duration: 0.18 }}
                >
                  {say}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>

          {/* An invisible copy of the tag, measured to know how wide to grow */}
          <div
            ref={sizer}
            style={{
              ...PILL,
              position: "absolute",
              top: 0,
              left: 0,
              visibility: "hidden",
            }}
          >
            <span style={{ fontWeight: 600 }}>{name}</span>
            {bubbles && say && <span>{say}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
