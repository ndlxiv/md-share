import { useEffect, useRef } from "react";
import type { CreatedShare } from "../lib/api";
import { CopyButton } from "./CopyButton";
import { Icon } from "./icons/Icon";

type CreatedPanelProps = { created: CreatedShare; onReset: () => void };

export function CreatedPanel({ created, onReset }: CreatedPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const fileCount = created.share.files.length;

  return (
    <section id="created-panel" className="created-panel card" aria-labelledby="created-title">
      <div className="created-head">
        <div className="created-badge"><Icon name="check" size={28} /></div>
        <h2 id="created-title" ref={headingRef} tabIndex={-1}>Share created</h2>
        <p className="meta">
          Your Markdown is live{fileCount > 1 ? ` with ${fileCount} files` : ""}. Anyone with the link can view it.
        </p>
      </div>

      <div className="created-link">
        <input id="share-url" readOnly value={created.url} aria-label="Share link" onFocus={(event) => event.target.select()} />
        <CopyButton id="copy-share-url" text={created.url} label="Copy link" copiedLabel="Copied" icon="link" className="primary" />
      </div>
      <div className="created-actions">
        <a id="open-share-url" className="button" href={created.url} target="_blank" rel="noreferrer">
          <Icon name="external" />
          <span>Open</span>
        </a>
        <button id="create-another" type="button" className="button" onClick={onReset}>
          <Icon name="plus" />
          <span>Create another</span>
        </button>
      </div>

      <div className="edit-code-box" role="note" aria-labelledby="edit-code-title">
        <div className="edit-code-head">
          <Icon name="key" />
          <div>
            <h3 id="edit-code-title">Save your edit code</h3>
            <p>This is the only time it is shown. Anyone with this code can edit or delete the share.</p>
          </div>
        </div>
        <div className="edit-code-row">
          <code id="edit-code" className="edit-code">{created.editCode}</code>
          <CopyButton text={created.editCode} label="Copy edit code" icon="copy" variant="icon" />
        </div>
        <CopyButton id="copy-edit-url" text={created.editUrl} label="Copy edit link" copiedLabel="Edit link copied" icon="pencil" className="wide" />
      </div>
    </section>
  );
}
