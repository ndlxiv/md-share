import { useRef } from "react";
import { LIMITS } from "../../functions/_lib/files-core.js";
import { formatBytes } from "../lib/markdown";
import { Icon } from "./icons/Icon";

export type FileEntry = { id: string; name: string; bytes: number; tooLarge: boolean };

type FileListProps = {
  files: FileEntry[];
  activeId: string;
  totalBytes: number;
  onSelect: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onRemove: (id: string) => void;
  onNew: () => void;
  onUpload: (files: FileList) => void;
};

export function FileList({ files, activeId, totalBytes, onSelect, onMove, onRemove, onNew, onUpload }: FileListProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = files.length >= LIMITS.maxFiles;
  const usage = Math.min(100, (totalBytes / LIMITS.maxTotalBytes) * 100);

  return (
    <section className="files-card card" aria-label="Files">
      <div className="panel-title">
        <span>Files</span>
        <span className="pill muted">{files.length}/{LIMITS.maxFiles}</span>
      </div>
      <ul className="file-list">
        {files.map((file, index) => {
          const active = file.id === activeId;
          return (
            <li key={file.id} className={`file-row${active ? " active" : ""}${file.tooLarge ? " invalid" : ""}`}>
              <button type="button" className="file-item" onClick={() => onSelect(file.id)} aria-current={active ? "true" : undefined}>
                <Icon name={file.tooLarge ? "alert" : "file-text"} size={16} />
                <span className="file-name">{file.name}</span>
                <small>{formatBytes(file.bytes)}</small>
              </button>
              {active && files.length > 1 && (
                <div className="file-tools">
                  <button type="button" className="icon-button sm" onClick={() => onMove(file.id, -1)} disabled={index === 0} aria-label={`Move ${file.name} up`} title="Move up">
                    <Icon name="arrow-up" size={16} />
                  </button>
                  <button type="button" className="icon-button sm" onClick={() => onMove(file.id, 1)} disabled={index === files.length - 1} aria-label={`Move ${file.name} down`} title="Move down">
                    <Icon name="arrow-down" size={16} />
                  </button>
                  <button type="button" className="icon-button sm danger" onClick={() => onRemove(file.id)} aria-label={`Remove ${file.name}`} title="Remove file">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="file-add">
        <button type="button" className="button sm" onClick={onNew} disabled={full}>
          <Icon name="file-plus" size={16} />
          <span>New file</span>
        </button>
        <button type="button" className="button sm" onClick={() => inputRef.current?.click()} disabled={full}>
          <Icon name="upload" size={16} />
          <span>Upload</span>
        </button>
        <input
          ref={inputRef}
          id="file-input"
          type="file"
          multiple
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          hidden
          onChange={(event) => {
            if (event.target.files?.length) onUpload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <p className="drop-hint meta">or drop .md files anywhere on the page</p>
      <div className="size-meter" aria-label="Share size">
        <div className="size-bar"><span style={{ width: `${usage}%` }} className={totalBytes > LIMITS.maxTotalBytes ? "over" : ""} /></div>
        <small>{formatBytes(totalBytes)} of 1 MB</small>
      </div>
    </section>
  );
}
