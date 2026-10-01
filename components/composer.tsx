"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
// Installed alongside, in the same folder.
import { AURA_PALETTES, Aura, type AuraColors } from "./aura";

/**
 * Composer. The prompt box an AI app needs. It grows as you write, takes
 * files by button, drop or paste, lets you pick a model, and turns speech into
 * text while Aura glows round its edge with your voice. While the model
 * answers, send becomes stop. Needs React, Framer Motion and aura.tsx beside
 * it. No Tailwind required. It takes its colours from the text around it.
 *
 *   <Composer
 *     onSubmit={({ text, files, model }) => send(text, files, model)}
 *     busy={answering}
 *     onStop={stop}
 *     models={[{ id: "fast", name: "Fast" }, { id: "smart", name: "Smart" }]}
 *     tools={<Context used={tokens} limit={200_000} />}
 *   />
 *
 * Fragms 1.0.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type ComposerModel = {
  id: string;
  name: string;
  /** A few words under the name in the menu. */
  note?: string;
};

export type ComposerMessage = {
  text: string;
  files: File[];
  model?: string;
};

export type ComposerProps = {
  onSubmit?: (message: ComposerMessage) => void;
  /** The model is answering. Send turns into stop. */
  busy?: boolean;
  onStop?: () => void;
  /** The hint in the empty box. Give several and they take turns. */
  placeholder?: string | string[];
  defaultValue?: string;
  /** The text, when you want to hold it yourself. Pair it with onValueChange. */
  value?: string;
  onValueChange?: (text: string) => void;
  models?: ComposerModel[];
  /** The chosen model. Left out, the Composer remembers it itself. */
  model?: string;
  onModelChange?: (id: string) => void;
  /** Lets people add files. */
  attachments?: boolean;
  /** Which files it takes, as in an input's accept. */
  accept?: string;
  /** Speech to text, where the browser supports it. */
  voice?: boolean;
  /** The language voice listens for. Left out, the page's own. */
  lang?: string;
  /** The send button and the focus ring. */
  color?: string;
  /** Aura's colours while it listens. Four, or fewer to repeat. */
  glow?: string[];
  /** Text above the buttons, or everything on one line. */
  layout?: "stacked" | "inline";
  /** A soft tint, a plain outline, a solid card, or frosted glass. */
  variant?: "soft" | "outline" | "solid" | "glass";
  size?: "small" | "medium" | "large";
  /** Corner radius in pixels. Left out, it follows the size. */
  radius?: number;
  sendIcon?: "arrow" | "plane" | "sparkle";
  /** A limit on the text, with a count that shows as it gets close. */
  maxLength?: number;
  /** Enter sends and Shift and Enter makes a new line. Off, Enter always makes a new line. */
  submitOnEnter?: boolean;
  /** A ring in the colour while it has focus. */
  focusRing?: boolean;
  /** Anything else for the toolbar, beside send. A Context ring fits well. */
  tools?: ReactNode;
  /** Tallest it grows before it scrolls, in pixels. */
  maxHeight?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  style?: CSSProperties;
};

type Attached = { id: string; file: File; url?: string };
type Scale = {
  font: number;
  button: number;
  icon: number;
  pad: number;
  radius: number;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const noSubscribe = () => () => {};
const SIZES: Record<NonNullable<ComposerProps["size"]>, Scale> = {
  small: { font: 14, button: 30, icon: 16, pad: 12, radius: 18 },
  medium: { font: 15, button: 34, icon: 18, pad: 16, radius: 24 },
  large: { font: 17, button: 40, icon: 20, pad: 18, radius: 28 },
};

export function Composer({
  onSubmit,
  busy = false,
  onStop,
  placeholder = "Ask anything",
  defaultValue = "",
  value,
  onValueChange,
  models,
  model,
  onModelChange,
  attachments = true,
  accept,
  voice = true,
  lang,
  color = "#3d7bff",
  glow,
  layout = "stacked",
  variant = "soft",
  size = "medium",
  radius,
  sendIcon = "arrow",
  maxLength,
  submitOnEnter = true,
  focusRing = true,
  tools,
  maxHeight = 200,
  disabled = false,
  autoFocus = false,
  className,
  style,
}: ComposerProps) {
  const [own, setOwn] = useState(defaultValue);
  const text = value ?? own;
  const setText = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  const [files, setFiles] = useState<Attached[]>([]);
  const [chosen, setChosen] = useState(models?.[0]?.id);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const dark = useDarkText(area);
  const scale = SIZES[size];
  const inline = layout === "inline";
  const hints = Array.isArray(placeholder) ? placeholder : [placeholder];

  const current = model ?? chosen;
  const listen = useVoice({
    lang,
    onText: (heard) => setText(maxLength ? heard.slice(0, maxLength) : heard),
  });
  const canListen = voice && listen.supported;
  const ready = !disabled && (text.trim().length > 0 || files.length > 0);
  const empty = !text && !listen.interim;

  // Grows with the text, up to maxHeight.
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(maxHeight, element.scrollHeight)}px`;
    element.style.overflowY =
      element.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [text, listen.interim, maxHeight, size, layout]);

  // Several hints take turns while the box is empty.
  useEffect(() => {
    if (hints.length < 2 || !empty || listen.active) return;
    const timer = setInterval(
      () => setHint((now) => (now + 1) % hints.length),
      3200,
    );
    return () => clearInterval(timer);
  }, [hints.length, empty, listen.active]);

  // Previews are object URLs, handed back when the Composer goes.
  const latest = useRef(files);
  useEffect(() => {
    latest.current = files;
  });
  useEffect(
    () => () =>
      latest.current.forEach(
        (item) => item.url && URL.revokeObjectURL(item.url),
      ),
    [],
  );

  function add(list: FileList | File[]) {
    const next = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      url: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    }));
    if (next.length) setFiles((now) => [...now, ...next]);
  }

  function remove(id: string) {
    setFiles((now) => {
      const gone = now.find((item) => item.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return now.filter((item) => item.id !== id);
    });
  }

  function submit() {
    if (busy || !ready) return;
    if (listen.active) listen.stop();
    onSubmit?.({
      text: text.trim(),
      files: files.map((item) => item.file),
      model: current,
    });
    files.forEach((item) => item.url && URL.revokeObjectURL(item.url));
    setFiles([]);
    setText("");
    area.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      submitOnEnter &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  }

  function onPaste(event: ClipboardEvent) {
    if (!attachments || !event.clipboardData.files.length) return;
    event.preventDefault();
    add(event.clipboardData.files);
  }

  function onDrop(event: DragEvent) {
    if (!attachments) return;
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  }

  const edge = `color-mix(in oklab, currentColor ${variant === "outline" ? 22 : 12}%, transparent)`;
  const line = "color-mix(in oklab, currentColor 12%, transparent)";
  const faint = "color-mix(in oklab, currentColor 50%, transparent)";
  const ring = focusRing && focused && !listen.active;
  // Aura takes four colours. Fewer are repeated round the edge.
  const lights = glow?.length ? glow : AURA_PALETTES.aurora;
  const palette = [0, 1, 2, 3].map(
    (i) => lights[i % lights.length],
  ) as AuraColors;
  const corner = radius ?? scale.radius;
  const left = maxLength ? maxLength - text.length : Infinity;
  // On one line, the text sits level with the buttons.
  const lineHeight = scale.font * 1.5;
  const textPad = inline
    ? `${Math.max(4, (scale.button - lineHeight) / 2)}px 6px`
    : `${scale.pad - 2}px ${scale.pad}px 6px`;

  const leading = (
    <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
      {attachments && (
        <>
          <IconButton
            label="Add files"
            onClick={() => picker.current?.click()}
            disabled={disabled}
            scale={scale}
          >
            <path d="M15.5 7.5 8.6 14.4a2 2 0 0 0 2.8 2.8l7-7a4 4 0 0 0-5.6-5.6l-7 7a6 6 0 0 0 8.5 8.5l6.2-6.2" />
          </IconButton>
          <input
            ref={picker}
            type="file"
            multiple
            accept={accept}
            hidden
            onChange={(event) => {
              if (event.target.files) add(event.target.files);
              event.target.value = "";
            }}
          />
        </>
      )}
      {models && models.length > 0 && (
        <ModelMenu
          models={models}
          value={current}
          dark={dark}
          disabled={disabled}
          height={scale.button}
          onChange={(id) => {
            setChosen(id);
            onModelChange?.(id);
          }}
        />
      )}
    </div>
  );

  const trailing = (
    <>
      <AnimatePresence>
        {left <= Math.max(10, (maxLength ?? 0) * 0.2) && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              padding: "0 6px",
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              color: left <= 0 ? "#ef4444" : faint,
            }}
          >
            {left}
          </motion.span>
        )}
      </AnimatePresence>
      {tools}
      {canListen && (
        <IconButton
          label={listen.active ? "Stop listening" : "Speak"}
          onClick={() => (listen.active ? listen.stop() : listen.start(text))}
          active={listen.active}
          color={color}
          disabled={disabled || busy}
          scale={scale}
        >
          {listen.active ? (
            <path d="M5 12.5 10 17.5 19 7" />
          ) : (
            <>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </>
          )}
        </IconButton>
      )}
      <Send
        busy={busy}
        ready={ready}
        color={color}
        icon={sendIcon}
        scale={scale}
        onSend={submit}
        onStop={() => onStop?.()}
      />
    </>
  );

  const field = (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <textarea
        ref={area}
        rows={1}
        value={
          listen.interim
            ? `${text}${text && !text.endsWith(" ") ? " " : ""}${listen.interim}`
            : text
        }
        onChange={(event) => {
          if (!listen.active) setText(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={listen.active}
        autoFocus={autoFocus}
        aria-label={hints[0]}
        style={{
          display: "block",
          boxSizing: "border-box",
          width: "100%",
          resize: "none",
          border: 0,
          outline: "none",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          fontSize: scale.font,
          lineHeight: 1.5,
          padding: textPad,
          margin: 0,
        }}
      />
      {/* The hint, drawn by hand so several can take turns */}
      {empty && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            padding: textPad,
            fontSize: scale.font,
            lineHeight: 1.5,
            color: faint,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={listen.active ? "listening" : hint % hints.length}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: EASE }}
              style={{
                display: "block",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {listen.active ? "Listening" : hints[hint % hints.length]}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
    </div>
  );

  return (
    <div
      className={className}
      style={{
        position: "relative",
        isolation: "isolate",
        boxSizing: "border-box",
        width: "100%",
        borderRadius: corner,
        background:
          variant === "solid"
            ? dark
              ? "#1a1a1a"
              : "#ffffff"
            : variant === "outline"
              ? "transparent"
              : `color-mix(in oklab, currentColor ${variant === "glass" ? 7 : 4}%, transparent)`,
        backdropFilter:
          variant === "glass" ? "blur(18px) saturate(1.5)" : undefined,
        WebkitBackdropFilter:
          variant === "glass" ? "blur(18px) saturate(1.5)" : undefined,
        boxShadow: [
          `inset 0 0 0 1px ${ring ? `color-mix(in oklab, ${color} 55%, transparent)` : edge}`,
          ring
            ? `0 0 0 4px color-mix(in oklab, ${color} 14%, transparent)`
            : "",
          variant === "solid"
            ? `0 16px 40px -18px rgba(0,0,0,${dark ? 0.8 : 0.3})`
            : "",
          variant === "glass" ? "0 10px 30px -12px rgba(0,0,0,0.25)" : "",
        ]
          .filter(Boolean)
          .join(", "),
        transition: "box-shadow 200ms ease, border-radius 300ms ease",
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
      onDragOver={(event) => {
        if (!attachments || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* While it listens, Aura glows round the inside edge with the voice */}
      <AnimatePresence>
        {listen.active && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              borderRadius: "inherit",
              pointerEvents: "none",
            }}
          >
            <Aura
              level={listen.level}
              palette={palette}
              intensity={0.85}
              style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Files waiting to go */}
      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                padding: "12px 12px 0",
              }}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {files.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
                  >
                    <Chip
                      item={item}
                      onRemove={() => remove(item.id)}
                      line={line}
                      faint={faint}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {inline ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            padding: 6,
          }}
        >
          {/* The buttons sit on the last line as the text grows, centred on send */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: scale.button,
              flexShrink: 0,
            }}
          >
            {leading}
          </div>
          {field}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              height: scale.button,
              flexShrink: 0,
            }}
          >
            {trailing}
          </div>
        </div>
      ) : (
        <>
          {field}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: `6px ${scale.pad / 2}px ${scale.pad / 2}px`,
            }}
          >
            {leading}
            <div style={{ flex: 1 }} />
            {trailing}
          </div>
        </>
      )}

      {/* A file held over it */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              inset: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: Math.max(0, corner - 4),
              border: `1.5px dashed ${color}`,
              background: `color-mix(in oklab, ${color} 10%, ${dark ? "#111" : "#fff"})`,
              color: color,
              fontSize: 14,
              fontWeight: 500,
              pointerEvents: "none",
            }}
          >
            Drop to add
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function IconButton({
  label,
  onClick,
  disabled,
  active,
  color,
  scale,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  color?: string;
  scale: Scale;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.9 }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: scale.button,
        height: scale.button,
        padding: 0,
        border: 0,
        borderRadius: 9999,
        background: active
          ? `color-mix(in oklab, ${color} 16%, transparent)`
          : "transparent",
        color: active ? color : "inherit",
        opacity: disabled ? 0.4 : active ? 1 : 0.7,
        cursor: disabled ? "default" : "pointer",
        transition:
          "background 200ms ease, color 200ms ease, opacity 200ms ease",
      }}
    >
      <svg
        width={scale.icon}
        height={scale.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </motion.button>
  );
}

/** Send, or stop while it answers. */
function Send({
  busy,
  ready,
  color,
  icon,
  scale,
  onSend,
  onStop,
}: {
  busy: boolean;
  ready: boolean;
  color: string;
  icon: NonNullable<ComposerProps["sendIcon"]>;
  scale: Scale;
  onSend: () => void;
  onStop: () => void;
}) {
  const live = busy || ready;
  const ring = scale.button + 8;
  return (
    <motion.button
      type="button"
      aria-label={busy ? "Stop" : "Send"}
      onClick={busy ? onStop : onSend}
      disabled={!live}
      whileTap={live ? { scale: 0.9 } : undefined}
      animate={{ scale: live ? 1 : 0.94 }}
      transition={{ type: "spring", duration: 0.35, bounce: 0.35 }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: scale.button,
        height: scale.button,
        marginLeft: 4,
        padding: 0,
        border: 0,
        borderRadius: 9999,
        background: live
          ? color
          : "color-mix(in oklab, currentColor 10%, transparent)",
        color: live
          ? contrast(color)
          : "color-mix(in oklab, currentColor 40%, transparent)",
        cursor: live ? "pointer" : "default",
        transition: "background 200ms ease, color 200ms ease",
      }}
    >
      {/* A slow arc round stop, so it reads as working */}
      <AnimatePresence>
        {busy && (
          <motion.svg
            key="arc"
            viewBox="0 0 40 40"
            aria-hidden="true"
            initial={{ opacity: 0, rotate: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.2 },
              rotate: { duration: 1.1, repeat: Infinity, ease: "linear" },
            }}
            style={{
              position: "absolute",
              top: -4,
              left: -4,
              width: ring,
              height: ring,
            }}
          >
            <circle
              cx="20"
              cy="20"
              r="18.5"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="28 90"
            />
          </motion.svg>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        <motion.svg
          key={busy ? "stop" : icon}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            marginTop: -scale.icon / 2,
            marginLeft: -scale.icon / 2,
          }}
          width={scale.icon}
          height={scale.icon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.4, rotate: busy ? -90 : 90 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.4 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
        >
          {busy ? (
            <rect
              x="7"
              y="7"
              width="10"
              height="10"
              rx="2.5"
              fill="currentColor"
            />
          ) : icon === "sparkle" ? (
            <path
              d="M12 3.5c.6 4.3 2.6 6.4 7 7-4.4.6-6.4 2.7-7 7-.6-4.3-2.6-6.4-7-7 4.4-.6 6.4-2.7 7-7Z"
              fill="currentColor"
            />
          ) : icon === "plane" ? (
            <path
              d="M20 4 4 10.5l6.5 2.5L13 19.5 20 4ZM10.5 13 14 9.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M12 19V5M6 11l6-6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </motion.svg>
      </AnimatePresence>
    </motion.button>
  );
}

function Chip({
  item,
  onRemove,
  line,
  faint,
}: {
  item: Attached;
  onRemove: () => void;
  line: string;
  faint: string;
}) {
  const remove = (
    <button
      type="button"
      aria-label={`Remove ${item.file.name}`}
      onClick={onRemove}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        padding: 0,
        border: 0,
        borderRadius: 9999,
        background: "rgba(0,0,0,0.65)",
        color: "#fff",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M2 2l6 6M8 2 2 8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  if (item.url) {
    return (
      <div style={{ position: "relative", width: 52, height: 52 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.file.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: 12,
            boxShadow: `0 0 0 1px ${line}`,
          }}
        />
        <span style={{ position: "absolute", top: -6, right: -6 }}>
          {remove}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 52,
        maxWidth: 220,
        boxSizing: "border-box",
        padding: "0 8px 0 10px",
        borderRadius: 12,
        boxShadow: `inset 0 0 0 1px ${line}`,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "color-mix(in oklab, currentColor 8%, transparent)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.3,
          flexShrink: 0,
        }}
      >
        {(item.file.name.split(".").pop() ?? "file").slice(0, 4).toUpperCase()}
      </span>
      <span style={{ minWidth: 0, fontSize: 13, lineHeight: 1.25 }}>
        <span
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.file.name}
        </span>
        <span style={{ display: "block", color: faint }}>
          {size(item.file.size)}
        </span>
      </span>
      {remove}
    </div>
  );
}

function ModelMenu({
  models,
  value,
  dark,
  disabled,
  height,
  onChange,
}: {
  models: ComposerModel[];
  value?: string;
  dark: boolean;
  disabled: boolean;
  height: number;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = models.find((item) => item.id === value) ?? models[0];

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const surface = dark ? "#161616" : "#ffffff";
  const ink = dark ? "#f5f5f5" : "#0a0a0a";

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOpen((now) => !now)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height,
          padding: "0 10px 0 12px",
          border: 0,
          borderRadius: 9999,
          background: open
            ? "color-mix(in oklab, currentColor 8%, transparent)"
            : "transparent",
          color: "inherit",
          font: "inherit",
          fontSize: 13,
          fontWeight: 500,
          opacity: open ? 1 : 0.75,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background 200ms ease, opacity 200ms ease",
        }}
      >
        {current.name}
        <motion.svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="listbox"
            aria-label="Model"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              zIndex: 40,
              minWidth: 220,
              padding: 6,
              borderRadius: 16,
              background: surface,
              color: ink,
              transformOrigin: "bottom left",
              boxShadow: `0 0 0 1px ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}, 0 18px 40px -14px rgba(0,0,0,${dark ? 0.7 : 0.25})`,
            }}
          >
            {models.map((item) => {
              const on = item.id === current.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    border: 0,
                    borderRadius: 10,
                    background: on
                      ? dark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)"
                      : "transparent",
                    color: "inherit",
                    font: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      {item.name}
                    </span>
                    {item.note && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          opacity: 0.55,
                        }}
                      >
                        {item.note}
                      </span>
                    )}
                  </span>
                  {on && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 12.5 10 17.5 19 7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Voice. The browser's own speech recognition for the words, and the        */
/* microphone's loudness for Aura.                                            */
/* ------------------------------------------------------------------------ */

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type RecognitionClass = new () => Recognition;

function recognitionClass() {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

function useVoice({
  lang,
  onText,
}: {
  lang?: string;
  onText: (text: string) => void;
}) {
  const supported = useSyncExternalStore(
    noSubscribe,
    () => Boolean(recognitionClass()),
    () => false,
  );
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState("");
  const session = useRef<{
    recognition: Recognition;
    stream?: MediaStream;
    context?: AudioContext;
    analyser?: AnalyserNode;
    data?: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const stop = () => {
    const now = session.current;
    session.current = null;
    if (now) {
      now.recognition.onend = null;
      now.recognition.stop();
      now.stream?.getTracks().forEach((track) => track.stop());
      void now.context?.close();
    }
    setActive(false);
    setInterim("");
  };

  const start = (before: string) => {
    const Recognizer = recognitionClass();
    if (!Recognizer || session.current) return;
    const recognition = new Recognizer();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang ?? document.documentElement.lang ?? "en";
    const base = before.trimEnd();
    let finals = "";
    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finals += result[0].transcript;
        else pending += result[0].transcript;
      }
      onTextRef.current([base, finals.trim()].filter(Boolean).join(" "));
      setInterim(pending.trim());
    };
    recognition.onend = stop;
    recognition.onerror = stop;
    session.current = { recognition };
    setActive(true);
    recognition.start();

    // The waveform only. Words still arrive if the microphone is refused here.
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        if (session.current?.recognition !== recognition) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.7;
        context.createMediaStreamSource(stream).connect(analyser);
        session.current = {
          recognition,
          stream,
          context,
          analyser,
          data: new Uint8Array(analyser.frequencyBinCount),
        };
      })
      .catch(() => {});
  };

  useEffect(
    () => () => {
      const now = session.current;
      if (!now) return;
      now.recognition.onend = null;
      now.recognition.abort();
      now.stream?.getTracks().forEach((track) => track.stop());
      void now.context?.close();
    },
    [],
  );

  // Loudness across the voice range, from 0 to 1. A slow breath until the
  // microphone is ready, or if it is refused.
  const level = useCallback(() => {
    const now = session.current;
    if (!now?.analyser || !now.data) {
      return 0.15 + 0.1 * Math.sin(performance.now() / 600);
    }
    now.analyser.getByteFrequencyData(now.data);
    const voice = now.data.subarray(1, Math.ceil(now.data.length * 0.6));
    const average = voice.reduce((sum, bin) => sum + bin, 0) / voice.length;
    return Math.min(1, (average / 255) * 2.2);
  }, []);

  return {
    supported,
    active,
    interim,
    start,
    stop,
    level,
  };
}

/* ------------------------------------------------------------------------ */

/** True when the text around it is light, so menus get a dark surface. */
function useDarkText(element: RefObject<HTMLElement | null>) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => {
      const node = element.current;
      if (!node) return;
      const [r, g, b] = (
        getComputedStyle(node).color.match(/[\d.]+/g) ?? []
      ).map(Number);
      setDark(0.2126 * r + 0.7152 * g + 0.0722 * b > 140);
    };
    const frame = requestAnimationFrame(read);
    // Themes usually switch with a class or attribute on the root.
    const watcher = new MutationObserver(() => requestAnimationFrame(read));
    watcher.observe(document.documentElement, { attributes: true });
    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
    };
  }, [element]);
  return dark;
}

/** White on dark colours, near black on light ones. */
function contrast(color: string) {
  const hex = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 170 ? "#0a0a0a" : "#ffffff";
}

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
