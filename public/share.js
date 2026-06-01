const input = document.querySelector("#markdown-input");
const preview = document.querySelector("#markdown-preview");
const createButtons = [
  document.querySelector("#create-share"),
  document.querySelector("#create-share-secondary"),
  document.querySelector("#create-share-mobile"),
];
const createdPanel = document.querySelector("#created-panel");
const shareUrlInput = document.querySelector("#share-url");
const openShareUrl = document.querySelector("#open-share-url");
const copyShareUrl = document.querySelector("#copy-share-url");
const createAnother = document.querySelector("#create-another");
const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector(".drop-zone");
const addFile = document.querySelector("#add-file");
const passwordProtect = document.querySelector("#password-protect");
const passwordRow = document.querySelector("#password-row");
const createAnotherLabel = "Create Another Share";

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listOpen = false;
  let codeOpen = false;
  let code = [];

  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      closeList();
      if (codeOpen) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        codeOpen = false;
      } else {
        codeOpen = true;
      }
      continue;
    }
    if (codeOpen) {
      code.push(line);
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      closeList();
      const level = line.match(/^#+/)[0].length;
      html.push(`<h${level}>${inlineMarkdown(line.replace(/^#{1,3}\s+/, ""))}</h${level}>`);
    } else if (/^-\s+/.test(line)) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^-\s+/, ""))}</li>`);
    } else if (line.trim()) {
      closeList();
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    } else {
      closeList();
    }
  }
  closeList();
  if (codeOpen) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  return html.join("\n");
}

function updatePreview() {
  const value = input.value.trim();
  preview.classList.toggle("muted-preview", !value);
  preview.innerHTML = value ? renderMarkdown(input.value) : "Nothing to preview";
  createButtons.forEach((button) => (button.disabled = !value));
}

async function createShare() {
  const content = input.value.trim();
  if (!content) return;
  createButtons.forEach((button) => (button.disabled = true));
  try {
    const response = await fetch("/api/shares", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        expiration: document.querySelector("#expiration").value,
        burnAfterReading: document.querySelector("#burn-after-reading").checked,
        passwordProtected: passwordProtect.checked,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "create_failed");
    shareUrlInput.value = payload.url;
    openShareUrl.href = payload.url;
    createdPanel.hidden = false;
    createdPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    alert(`Could not create share: ${error.message}`);
  } finally {
    updatePreview();
  }
}

async function loadFile(file) {
  if (!file) return;
  input.value = await file.text();
  updatePreview();
}

input?.addEventListener("input", updatePreview);
createButtons.forEach((button) => button?.addEventListener("click", createShare));
copyShareUrl?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(shareUrlInput.value);
  copyShareUrl.textContent = "Copied";
});
createAnother?.addEventListener("click", () => {
  createdPanel.hidden = true;
  input.value = "";
  shareUrlInput.value = "";
  updatePreview();
});
addFile?.addEventListener("click", () => fileInput.click());
fileInput?.addEventListener("change", () => loadFile(fileInput.files?.[0]));
dropZone?.addEventListener("dragover", (event) => event.preventDefault());
dropZone?.addEventListener("drop", (event) => {
  event.preventDefault();
  loadFile(event.dataTransfer.files?.[0]);
});
passwordProtect?.addEventListener("change", () => {
  passwordRow.hidden = !passwordProtect.checked;
});

updatePreview();
