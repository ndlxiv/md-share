import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  DEFAULT_EXPIRATION,
  LIMITS,
  MARKDOWN_EXTENSIONS,
  assignFileSlugs,
  byteLength,
  createFileLinkResolver,
  dedupeFilenames,
  defaultFilename,
} from "../../functions/_lib/files-core.js";
import {
  createShare,
  deleteShare,
  errorMessage,
  getShare,
  updateShare,
  type CreatedShare,
  type EditableShare,
  type SharePayload,
} from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import { CreatedPanel } from "./CreatedPanel";
import { FileList } from "./FileList";
import { Icon } from "./icons/Icon";
import { ShareOptions, type OptionsState } from "./ShareOptions";

type Mode = "create" | "edit";
type Draft = { id: string; filename: string; content: string };
type Notice = { kind: "error" | "success" | "info"; text: string } | null;
type EditPhase = "locked" | "unlocking" | "editing" | "deleted";

let nextId = 0;
const newDraft = (content = "", filename = ""): Draft => ({ id: `f${(nextId += 1)}`, filename, content });
const PREVIEW_LINK_PREFIX = "#mds-file:";

function readEditTarget() {
  const fromPath = location.pathname.match(/^\/e\/([^/]+)/)?.[1];
  const id = decodeURIComponent(fromPath || new URLSearchParams(location.search).get("id") || "");
  const code = decodeURIComponent(location.hash.replace(/^#/, ""));
  // Keep the code out of the address bar, history and screenshots.
  if (code) history.replaceState(null, "", location.pathname + location.search);
  return { id, code };
}

export default function ShareComposer({ mode = "create" }: { mode?: Mode }) {
  const [files, setFiles] = useState<Draft[]>(() => [newDraft()]);
  const [activeId, setActiveId] = useState(() => files[0].id);
  const [view, setView] = useState<"write" | "preview">("write");
  const [options, setOptions] = useState<OptionsState>({
    passwordProtected: false,
    password: "",
    expiration: mode === "edit" ? "keep" : DEFAULT_EXPIRATION,
  });
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const dragDepth = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit mode state
  const [phase, setPhase] = useState<EditPhase>("locked");
  const [target, setTarget] = useState({ id: "", code: "" });
  const [codeInput, setCodeInput] = useState("");
  const [current, setCurrent] = useState<EditableShare | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const active = files.find((file) => file.id === activeId) || files[0];
  const names = useMemo(
    () => dedupeFilenames(files.map((file, index) => file.filename.trim() || defaultFilename(file.content, index))),
    [files]
  );
  const activeIndex = files.indexOf(active);
  const totalBytes = useMemo(() => files.reduce((sum, file, index) => sum + byteLength(file.content) + byteLength(names[index]), 0), [files, names]);
  const tooLargeIds = new Set(files.filter((file) => file.content.length > LIMITS.maxFileChars).map((file) => file.id));
  const hasContent = files.some((file) => file.content.trim());
  const sizeError =
    tooLargeIds.size > 0
      ? "A file is over the 100,000 character limit."
      : totalBytes > LIMITS.maxTotalBytes
        ? "The share is over the 1 MB limit."
        : "";
  const canSubmit = ready && hasContent && !sizeError && !busy;

  // Rendering is deferred so typing stays smooth in long documents.
  const deferredContent = useDeferredValue(active.content);
  const previewHtml = useMemo(() => {
    if (!deferredContent.trim()) return "";
    const resolveLink = createFileLinkResolver(names, (slug: string, hash: string) => `${PREVIEW_LINK_PREFIX}${slug}${hash ? `#${hash}` : ""}`);
    return renderMarkdown(deferredContent, { resolveLink });
  }, [deferredContent, names]);

  const updateFiles = useCallback((updater: (files: Draft[]) => Draft[]) => {
    setFiles(updater);
    setDirty(true);
  }, []);

  const patchActive = (patch: Partial<Draft>) =>
    updateFiles((list) => list.map((file) => (file.id === active.id ? { ...file, ...patch } : file)));

  async function addUploads(list: FileList | File[]) {
    const incoming = Array.from(list).filter((file) => MARKDOWN_EXTENSIONS.test(file.name) || file.type.startsWith("text/"));
    if (!incoming.length) {
      setNotice({ kind: "error", text: "Only .md, .markdown and .txt files can be added." });
      return;
    }
    const replaceBlank = files.length === 1 && !files[0].content.trim() && !files[0].filename.trim();
    const room = LIMITS.maxFiles - (replaceBlank ? 0 : files.length);
    const accepted = incoming.slice(0, Math.max(0, room));
    const drafts = await Promise.all(accepted.map(async (file) => newDraft(await file.text(), file.name)));
    if (!drafts.length) {
      setNotice({ kind: "error", text: `A share can contain up to ${LIMITS.maxFiles} files.` });
      return;
    }
    updateFiles((list) => (replaceBlank ? drafts : [...list, ...drafts]));
    setActiveId(drafts[0].id);
    setNotice(
      accepted.length < incoming.length
        ? { kind: "error", text: `Only ${accepted.length} of ${incoming.length} files were added: a share can contain up to ${LIMITS.maxFiles} files.` }
        : null
    );
  }

  function addBlankFile() {
    if (files.length >= LIMITS.maxFiles) return;
    const draft = newDraft();
    updateFiles((list) => [...list, draft]);
    setActiveId(draft.id);
    setView("write");
  }

  function moveFile(id: string, delta: -1 | 1) {
    updateFiles((list) => {
      const index = list.findIndex((file) => file.id === id);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }

  function removeFile(id: string) {
    const index = files.findIndex((file) => file.id === id);
    const remaining = files.filter((file) => file.id !== id);
    const list = remaining.length ? remaining : [newDraft()];
    updateFiles(() => list);
    setActiveId(list[Math.min(index, list.length - 1)].id);
  }

  function payload(): SharePayload {
    return {
      files: files.map((file, index) => ({ filename: names[index], content: file.content })).filter((file) => file.content.trim()),
      expiration: options.expiration,
      passwordProtected: options.passwordProtected,
      password: options.passwordProtected ? options.password : "",
    };
  }

  function validateOptions() {
    const needsPassword = options.passwordProtected && !options.password && !(mode === "edit" && current?.passwordProtected);
    if (needsPassword) {
      setNotice({ kind: "error", text: "Enter a password or turn off password protection." });
      document.getElementById("share-password")?.focus();
      return false;
    }
    return true;
  }

  async function submit() {
    if (!canSubmit || !validateOptions()) return;
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "create") {
        setCreated(await createShare(payload()));
        window.scrollTo({ top: 0 });
      } else {
        const result = await updateShare(target.id, target.code, payload());
        applyLoadedShare(result.share);
        setNotice({ kind: "success", text: "Changes saved. They are live now." });
      }
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function resetComposer() {
    const draft = newDraft();
    setFiles([draft]);
    setActiveId(draft.id);
    setCreated(null);
    setNotice(null);
    setView("write");
    setOptions({ passwordProtected: false, password: "", expiration: DEFAULT_EXPIRATION });
    setDirty(false);
  }

  // ---- Edit mode -------------------------------------------------------

  function applyLoadedShare(share: EditableShare) {
    const drafts = share.files.map((file) => newDraft(file.content, file.filename));
    setFiles(drafts);
    setActiveId((id) => drafts[files.findIndex((file) => file.id === id)]?.id || drafts[0].id);
    setCurrent(share);
    setOptions({ passwordProtected: share.passwordProtected, password: "", expiration: "keep" });
    setDirty(false);
  }

  async function unlock(id: string, code: string) {
    if (!id) {
      setNotice({ kind: "error", text: "This edit link is missing the share id." });
      return;
    }
    if (!code.trim()) {
      setNotice({ kind: "error", text: "Enter the edit code for this share." });
      return;
    }
    setPhase("unlocking");
    setNotice(null);
    try {
      const { share } = await getShare(id, code);
      setTarget({ id, code });
      applyLoadedShare(share);
      setPhase("editing");
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
      setPhase("locked");
    }
  }

  async function removeShare() {
    setBusy(true);
    setNotice(null);
    try {
      await deleteShare(target.id, target.code);
      setDirty(false);
      setPhase("deleted");
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  // Keep anything typed before hydration finished, then enable the controls.
  useEffect(() => {
    const typed = textareaRef.current?.value || "";
    if (mode === "create" && typed) setFiles((list) => [{ ...list[0], content: typed }]);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "edit") return;
    const { id, code } = readEditTarget();
    setTarget({ id, code: "" });
    if (code) {
      setCodeInput(code);
      void unlock(id, code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit" || !dirty || phase !== "editing") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mode, dirty, phase]);

  // ---- Shortcuts and drag & drop --------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "Enter" || (mode === "edit" && event.key.toLowerCase() === "s"))) {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const workspaceVisible = mode === "create" ? !created : phase === "editing";

  useEffect(() => {
    if (!workspaceVisible) return;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes("Files");
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (event.dataTransfer?.files.length) void addUploads(event.dataTransfer.files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  });

  function onPreviewClick(event: MouseEvent<HTMLElement>) {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href") || "";
    if (!href.startsWith(PREVIEW_LINK_PREFIX)) return;
    event.preventDefault();
    const slug = href.slice(PREVIEW_LINK_PREFIX.length).split("#")[0];
    const index = assignFileSlugs(names).indexOf(slug);
    if (index >= 0) setActiveId(files[index].id);
  }

  // ---- Render ----------------------------------------------------------

  const primaryLabel = mode === "create" ? "Create Share" : "Save changes";
  const primaryIcon = mode === "create" ? "share" : "save";
  const primaryButton = (id: string, className = "") => (
    <button id={id} type="button" className={`button primary ${className}`} onClick={() => void submit()} disabled={!canSubmit} aria-busy={busy}>
      <Icon name={busy ? "loader" : primaryIcon} className={busy ? "spin" : ""} />
      <span>{busy ? (mode === "create" ? "Creating…" : "Saving…") : primaryLabel}</span>
    </button>
  );

  const noticeView = notice && (
    <p className={`alert ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <Icon name={notice.kind === "error" ? "alert" : notice.kind === "success" ? "check" : "info"} />
      <span>{notice.text}</span>
    </p>
  );

  if (mode === "create" && created) {
    return (
      <div className="composer" data-mode="create">
        <CreatedPanel created={created} onReset={resetComposer} />
      </div>
    );
  }

  if (mode === "edit" && phase !== "editing") {
    return (
      <div className="composer" data-mode="edit" data-ready={ready || undefined}>
        {phase === "deleted" ? (
          <section className="card notice-card">
            <div className="notice-icon"><Icon name="trash" /></div>
            <h1>Share deleted</h1>
            <p className="meta">The share and all of its files are gone. Its link no longer works.</p>
            <a className="button primary wide" href="/">
              <Icon name="plus" />
              <span>Create a new share</span>
            </a>
          </section>
        ) : (
          <form
            className="card notice-card unlock-card"
            onSubmit={(event) => {
              event.preventDefault();
              void unlock(target.id, codeInput);
            }}
          >
            <div className="notice-icon"><Icon name="key" /></div>
            <h1>Edit share</h1>
            <p className="meta">Enter the edit code you saved when the share was created.</p>
            <label className="field">
              <span>Edit code</span>
              <input
                id="edit-code-input"
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
              />
            </label>
            {noticeView}
            <button className="button primary wide" type="submit" disabled={!ready || phase === "unlocking"}>
              <Icon name={phase === "unlocking" ? "loader" : "pencil"} className={phase === "unlocking" ? "spin" : ""} />
              <span>{phase === "unlocking" ? "Checking…" : "Edit share"}</span>
            </button>
          </form>
        )}
      </div>
    );
  }

  const shareUrl = target.id ? `/s/${encodeURIComponent(target.id)}` : "";

  return (
    <div className={`composer${dragging ? " is-dragging" : ""}`} data-mode={mode} data-ready={ready || undefined}>
      <section className="composer-hero" aria-label={mode === "create" ? "Create a share" : "Edit share"}>
        <div className="hero-copy">
          <p className="eyebrow">{mode === "create" ? "Markdown sharing" : "Editing"}</p>
          <h1>{mode === "create" ? "MDShare" : current?.title || "Edit share"}</h1>
          <p className="lead">
            {mode === "create"
              ? "Write or drop Markdown files, preview them live, and share one clean link."
              : "Changes go live at the same link as soon as you save."}
          </p>
        </div>
        <div className="hero-actions">
          {mode === "edit" && (
            <>
              <a className="button" href={shareUrl} target="_blank" rel="noreferrer">
                <Icon name="external" />
                <span>View share</span>
              </a>
              <button type="button" className="button danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Icon name="trash" />
                <span>Delete</span>
              </button>
            </>
          )}
          {primaryButton("create-share", "hero-primary")}
        </div>
      </section>

      {confirmDelete && (
        <div className="alert error confirm-delete" role="alertdialog" aria-labelledby="confirm-delete-text">
          <Icon name="alert" />
          <span id="confirm-delete-text">Delete this share permanently? This cannot be undone.</span>
          <div className="confirm-actions">
            <button type="button" className="button sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button type="button" className="button sm danger solid" onClick={() => void removeShare()} disabled={busy}>
              <Icon name="trash" size={16} />
              <span>Delete share</span>
            </button>
          </div>
        </div>
      )}
      {noticeView}

      <div className="workspace">
        <FileList
          files={files.map((file, index) => ({
            id: file.id,
            name: names[index],
            bytes: byteLength(file.content),
            tooLarge: tooLargeIds.has(file.id),
          }))}
          activeId={active.id}
          totalBytes={totalBytes}
          onSelect={(id) => setActiveId(id)}
          onMove={moveFile}
          onRemove={removeFile}
          onNew={addBlankFile}
          onUpload={(list) => void addUploads(list)}
        />

        <section className="editor-card card" aria-label="Editor">
          <div className="editor-head">
            <label className="filename-field">
              <Icon name="file-text" size={16} />
              <span className="sr-only">File name</span>
              <input
                id="file-name"
                value={active.filename}
                placeholder={defaultFilename(active.content, activeIndex)}
                onChange={(event) => patchActive({ filename: event.target.value })}
                spellCheck={false}
              />
            </label>
            <div className="segmented view-switch" role="tablist" aria-label="Editor view">
              <button type="button" role="tab" aria-selected={view === "write"} onClick={() => setView("write")}>
                <Icon name="pencil" size={16} />
                <span>Write</span>
              </button>
              <button type="button" role="tab" aria-selected={view === "preview"} onClick={() => setView("preview")}>
                <Icon name="eye" size={16} />
                <span>Preview</span>
              </button>
            </div>
          </div>
          <div className="panes" data-view={view}>
            <div className="pane pane-write">
              <span className="pane-label">Write</span>
              <textarea
                ref={textareaRef}
                id="markdown-input"
                value={active.content}
                onChange={(event) => patchActive({ content: event.target.value })}
                placeholder={"# Title\n\nWrite Markdown here, or drop .md files anywhere on the page."}
                spellCheck={false}
                aria-label="Markdown"
              />
            </div>
            <div className="pane pane-preview">
              <span className="pane-label">Preview</span>
              {previewHtml ? (
                <article id="markdown-preview" className="prose" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <article id="markdown-preview" className="prose empty-preview">
                  <Icon name="eye" size={22} />
                  <span>Nothing to preview yet</span>
                </article>
              )}
            </div>
          </div>
          {sizeError && (
            <p className="alert error editor-alert" role="alert">
              <Icon name="alert" />
              <span>{sizeError}</span>
            </p>
          )}
        </section>

        <ShareOptions
          value={options}
          onChange={(next) => {
            setOptions(next);
            setDirty(true);
          }}
          onSubmit={() => void submit()}
          current={mode === "edit" && current ? { passwordProtected: current.passwordProtected, expiresAt: current.expires_at } : undefined}
        />
      </div>

      <div className="action-bar">{primaryButton("create-share-mobile", "wide")}</div>

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <Icon name="upload" size={32} />
            <p>Drop Markdown files to add them</p>
          </div>
        </div>
      )}
    </div>
  );
}
