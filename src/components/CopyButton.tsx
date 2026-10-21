import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons/Icon";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older Safari / insecure contexts: fall back to a temporary selection.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

type CopyButtonProps = {
  text: string;
  label: string;
  copiedLabel?: string;
  icon?: IconName;
  /** "icon" renders a square icon-only button; the label becomes its accessible name. */
  variant?: "button" | "icon";
  className?: string;
  id?: string;
};

export function CopyButton({ text, label, copiedLabel = "Copied", icon = "copy", variant = "button", className = "", id }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleClick() {
    if (!(await copyText(text))) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  const stateClass = copied ? " is-copied" : "";
  if (variant === "icon") {
    return (
      <button id={id} type="button" className={`icon-button copy-button${stateClass} ${className}`} onClick={handleClick} aria-label={label} title={label}>
        <Icon name={copied ? "check" : icon} />
        <span className="sr-only" aria-live="polite">{copied ? copiedLabel : ""}</span>
      </button>
    );
  }
  return (
    <button id={id} type="button" className={`button${stateClass} ${className}`} onClick={handleClick}>
      <Icon name={copied ? "check" : icon} />
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
