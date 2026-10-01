"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Context. A small ring that fills as a conversation uses up the model's
 * context window. Hover or tap it to see what is taking the room and what the
 * next reply costs, and it turns amber, then red, before the model starts to
 * forget. One file, React only. No Tailwind required. It takes its colours
 * from the text around it, so it fits a light or a dark interface as it is.
 *
 *   <Context used={84_200} limit={200_000} price={3} />
 *
 *   <Context
 *     limit={200_000}
 *     parts={[
 *       { label: "Instructions", tokens: 2_400 },
 *       { label: "Files", tokens: 31_000 },
 *       { label: "Messages", tokens: 50_800 },
 *     ]}
 *     onCompact={summarise}
 *   />
 *
 * Fragms 1.0.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type ContextPart = {
  label: string;
  tokens: number;
  /** Its colour in the breakdown. Left out, one is picked for it. */
  color?: string;
};

export type ContextProps = {
  /** Tokens in the conversation so far. Ignored when parts are given. */
  used?: number;
  /** What the tokens are made of. Their sum is the total. */
  parts?: ContextPart[];
  /** The model's context window, in tokens. */
  limit?: number;
  /** Price per million input tokens. Left out, no cost is shown. */
  price?: number;
  currency?: string;
  /** The share of the window at which it starts to warn, from 0 to 1. */
  warnAt?: number;
  /** The share at which it turns red, from 0 to 1. */
  fullAt?: number;
  /** A ring, or a slim bar. */
  shape?: "ring" | "bar";
  /** The ring's diameter in pixels. A bar is a little wider than this. */
  size?: number;
  /** How thick the line is, as a share of the size. */
  thickness?: number;
  /** Draws each part in its own colour, instead of one fill. */
  segments?: boolean;
  /** What reads beside it. Tokens used, tokens left, or the share. */
  label?: "none" | "percent" | "used" | "left";
  /** The fill while there is room, and once it warns and fills. Fine follows the text colour when left out. */
  colors?: { fine?: string; warn?: string; full?: string };
  /** The lines in the breakdown once it warns, and once it is nearly full. */
  messages?: { warn?: string; full?: string };
  /** Opens a breakdown on hover and tap. */
  breakdown?: boolean;
  /** Where the breakdown opens. */
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  /** Holds the breakdown open or shut. Left out, hover and tap decide. */
  open?: boolean;
  /** Offered in the breakdown once it warns, to summarise or trim. */
  onCompact?: () => void;
  compactLabel?: string;
  className?: string;
  style?: CSSProperties;
};

const PART_COLORS = ["#3d7bff", "#a23bff", "#ff5fa2", "#ffb03d", "#22b573"];
const WARN = "#f5a524";
const PANEL = 264;
const FULL = "#ef4444";

/** 820, 84.2k, 1.2M. */
export function formatTokens(tokens: number) {
  const n = Math.max(0, Math.round(tokens));
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`.replace(".0k", "k");
  }
  return `${(n / 1_000_000).toFixed(1)}M`.replace(".0M", "M");
}

export function Context({
  used = 0,
  parts,
  limit = 200_000,
  price,
  currency = "$",
  warnAt = 0.8,
  fullAt = 0.95,
  shape = "ring",
  size = 22,
  thickness = 0.14,
  segments = false,
  label = "none",
  colors,
  messages,
  breakdown = true,
  side = "top",
  align = "center",
  open,
  onCompact,
  compactLabel = "Summarise to free space",
  className,
  style,
}: ContextProps) {
  const id = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dark, setDark] = useState(false);
  const [nudge, setNudge] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const total = parts
    ? parts.reduce((sum, part) => sum + Math.max(0, part.tokens), 0)
    : Math.max(0, used);
  const shown = useEased(total);
  const ratio = Math.min(1, shown / limit);
  const exact = total / limit;
  const state = exact >= fullAt ? "full" : exact >= warnAt ? "warn" : "fine";
  const tint =
    state === "full"
      ? (colors?.full ?? FULL)
      : state === "warn"
        ? (colors?.warn ?? WARN)
        : colors?.fine;
  const isOpen = breakdown && (open ?? (pinned || hovered));

  // The breakdown needs a solid surface. It reads the text colour around it
  // to tell a dark interface from a light one, and slides along to stay on
  // screen when the ring sits near an edge.
  useEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const element = wrapper.current;
      if (!element) return;
      setDark(isLight(getComputedStyle(element).color));
      const box = element.getBoundingClientRect();
      const width = Math.min(PANEL, window.innerWidth - 16);
      const left =
        align === "center"
          ? box.left + box.width / 2 - width / 2
          : align === "start"
            ? box.left
            : box.right - width;
      const fits = Math.min(window.innerWidth - 8 - width, Math.max(8, left));
      setNudge(Math.round(fits - left));
    };
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
    };
  }, [isOpen, align]);

  // A tap opens it until a tap somewhere else, or Escape.
  useEffect(() => {
    if (!pinned) return;
    const away = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setPinned(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [pinned]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const hover = (next: boolean) => (event: ReactPointerEvent) => {
    if (event.pointerType === "touch") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(next), next ? 120 : 180);
  };

  const stroke = Math.max(1.5, size * thickness);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const percent = Math.round(exact * 100);
  const items = (parts ?? [{ label: "Conversation", tokens: total }]).map(
    (part, i) => ({
      ...part,
      color: part.color ?? PART_COLORS[i % PART_COLORS.length],
    }),
  );
  // Each part's share of the fill, for segments.
  let start = 0;
  const slices = items.map((part) => {
    const share =
      (Math.max(0, part.tokens) / limit) * (total ? shown / total : 0);
    const slice = {
      color: part.color,
      start,
      share: Math.min(share, 1 - start),
    };
    start = Math.min(1, start + share);
    return slice;
  });
  const reading =
    label === "used"
      ? formatTokens(shown)
      : label === "left"
        ? `${formatTokens(Math.max(0, limit - shown))} left`
        : `${Math.round(ratio * 100)}%`;
  const fill = tint ?? "currentColor";
  const cost = price === undefined ? null : (total / 1_000_000) * price;

  const surface = dark ? "#161616" : "#ffffff";
  const ink = dark ? "#f5f5f5" : "#0a0a0a";
  const soft = dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";
  const line = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  return (
    <span
      ref={wrapper}
      className={className}
      style={{ position: "relative", display: "inline-flex", ...style }}
      onPointerEnter={hover(true)}
      onPointerLeave={hover(false)}
    >
      <button
        type="button"
        aria-label={`Context, ${percent}% used`}
        aria-expanded={breakdown ? isOpen : undefined}
        aria-controls={breakdown ? id : undefined}
        onClick={() => setPinned((value) => !value)}
        onFocus={(event) =>
          event.currentTarget.matches(":focus-visible") && setHovered(true)
        }
        onBlur={() => setHovered(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: label !== "none" ? "4px 8px 4px 4px" : 4,
          margin: 0,
          border: 0,
          borderRadius: 9999,
          background: "transparent",
          color: "inherit",
          font: "inherit",
          cursor: breakdown ? "pointer" : "default",
        }}
      >
        {shape === "ring" ? (
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            aria-hidden="true"
            style={{ display: "block", transform: "rotate(-90deg)" }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.14}
              strokeWidth={stroke}
            />
            {segments && state === "fine" ? (
              slices.map((slice, i) =>
                slice.share * circumference > 0.5 ? (
                  <circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={stroke}
                    strokeDasharray={`${Math.max(0, slice.share * circumference - 1)} ${circumference}`}
                    strokeDashoffset={-slice.start * circumference}
                  />
                ) : null,
              )
            ) : (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={fill}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0.001, ratio * circumference)} ${circumference}`}
                style={{ transition: "stroke 400ms ease" }}
              />
            )}
          </svg>
        ) : (
          <span
            aria-hidden="true"
            style={{
              position: "relative",
              display: "block",
              width: size * 2.4,
              height: Math.max(3, stroke),
              borderRadius: 9999,
              overflow: "hidden",
              background: "color-mix(in oklab, currentColor 14%, transparent)",
            }}
          >
            {segments && state === "fine" ? (
              slices.map((slice, i) => (
                <span
                  key={i}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${slice.start * 100}%`,
                    width: `calc(${slice.share * 100}% - 1px)`,
                    background: slice.color,
                  }}
                />
              ))
            ) : (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${ratio * 100}%`,
                  borderRadius: 9999,
                  background: fill,
                  transition: "background 400ms ease",
                }}
              />
            )}
          </span>
        )}
        {label !== "none" && (
          <span
            style={{
              fontSize: 12,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: tint ?? "inherit",
              opacity: tint ? 1 : 0.6,
              transition: "color 400ms ease",
            }}
          >
            {reading}
          </span>
        )}
      </button>

      {/* The breakdown */}
      {breakdown && (
        <span
          id={id}
          role="dialog"
          aria-label="Context used"
          aria-hidden={!isOpen}
          style={{
            position: "absolute",
            zIndex: 40,
            width: `min(${PANEL}px, calc(100vw - 16px))`,
            boxSizing: "border-box",
            padding: 14,
            borderRadius: 16,
            background: surface,
            color: ink,
            boxShadow: `0 0 0 1px ${line}, 0 18px 40px -14px rgba(0,0,0,${dark ? 0.7 : 0.25})`,
            fontSize: 13,
            lineHeight: 1.35,
            textAlign: "left",
            ...(side === "top"
              ? { bottom: "calc(100% + 10px)" }
              : { top: "calc(100% + 10px)" }),
            ...(align === "center"
              ? { left: "50%", translate: `calc(-50% + ${nudge}px) 0` }
              : align === "start"
                ? { left: 0, translate: `${nudge}px 0` }
                : { right: 0, translate: `${nudge}px 0` }),
            opacity: isOpen ? 1 : 0,
            transform: isOpen
              ? "none"
              : `translateY(${side === "top" ? 6 : -6}px) scale(0.97)`,
            transformOrigin: side === "top" ? "bottom center" : "top center",
            visibility: isOpen ? "visible" : "hidden",
            pointerEvents: isOpen ? "auto" : "none",
            transition: isOpen
              ? "opacity 220ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s"
              : "opacity 160ms ease, transform 200ms ease, visibility 0s 200ms",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTokens(shown)}
              <span style={{ color: soft, fontWeight: 400 }}>
                {" "}
                of {formatTokens(limit)}
              </span>
            </span>
            <span
              style={{
                color: tint ?? soft,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {percent}%
            </span>
          </span>

          {/* One bar, each part its own colour, the free space left empty */}
          <span
            style={{
              display: "flex",
              gap: 2,
              height: 6,
              marginTop: 10,
              borderRadius: 9999,
              overflow: "hidden",
              background: line,
            }}
          >
            {items.map((part) => (
              <span
                key={part.label}
                style={{
                  width: `${Math.min(100, (Math.max(0, part.tokens) / limit) * 100)}%`,
                  background: part.color,
                  borderRadius: 9999,
                  transition: "width 500ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            ))}
          </span>

          <span
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 12,
            }}
          >
            {items.map((part) => (
              <Row
                key={part.label}
                color={part.color}
                label={part.label}
                value={formatTokens(part.tokens)}
                soft={soft}
              />
            ))}
            <Row
              label="Free"
              value={formatTokens(Math.max(0, limit - total))}
              soft={soft}
              hollow={line}
            />
          </span>

          {cost !== null && (
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 12,
                paddingTop: 10,
                borderTop: `1px solid ${line}`,
              }}
            >
              <span style={{ color: soft }}>Each reply reads it all</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {currency}
                {cost < 0.1 ? cost.toFixed(3) : cost.toFixed(2)}
              </span>
            </span>
          )}

          {state !== "fine" && (
            <span
              style={{
                display: "block",
                marginTop: 12,
                padding: "9px 10px",
                borderRadius: 10,
                background: `color-mix(in oklab, ${tint} 14%, transparent)`,
                color: dark ? tint : `color-mix(in oklab, ${tint} 70%, black)`,
              }}
            >
              {state === "full"
                ? (messages?.full ??
                  "Nearly full. The oldest messages are about to be forgotten.")
                : (messages?.warn ??
                  "Filling up. Past this point the model may lose track of early details.")}
              {onCompact && (
                <button
                  type="button"
                  tabIndex={isOpen ? 0 : -1}
                  onClick={() => {
                    onCompact();
                    setPinned(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 8,
                    padding: "7px 10px",
                    border: 0,
                    borderRadius: 8,
                    background: ink,
                    color: surface,
                    font: "inherit",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {compactLabel}
                </button>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function Row({
  color,
  hollow,
  label,
  value,
  soft,
}: {
  color?: string;
  hollow?: string;
  label: string;
  value: string;
  soft: string;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 3,
          flexShrink: 0,
          background: color ?? "transparent",
          boxShadow: hollow ? `inset 0 0 0 1.5px ${hollow}` : undefined,
        }}
      />
      <span style={{ flex: 1, color: color ? undefined : soft }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: soft }}>
        {value}
      </span>
    </span>
  );
}

/** Eases towards a number, so the ring and the count glide instead of jump. */
function useEased(target: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const tick = () => {
      const next = still
        ? target
        : current.current + (target - current.current) * 0.16;
      current.current = Math.abs(target - next) < 1 ? target : next;
      setValue(current.current);
      if (current.current !== target) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

/** True for a light colour, read from a computed rgb() value. */
function isLight(color: string) {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map(Number);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}
