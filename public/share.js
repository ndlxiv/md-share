import { renderMarkdown } from "./render.js";

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
const createAnotherLabel = "Create Another Share";
const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector(".drop-zone");
const addFile = document.querySelector("#add-file");
const passwordProtect = document.querySelector("#password-protect");
const passwordRow = document.querySelector("#password-row");
const passwordInput = document.querySelector("#share-password");
let selectedFilename = "README.md";

function updatePreview() {
  const value = input.value.trim();
  preview.classList.toggle("muted-preview", !value);
  preview.innerHTML = value ? renderMarkdown(input.value) : "Nothing to preview";
  createButtons.forEach((button) => (button.disabled = !value));
}

function updateFileLabel(filename = selectedFilename) {
  const fileNameNode = document.querySelector(".file-item span");
  const fileMetaNode = document.querySelector(".file-item small");
  if (fileNameNode) fileNameNode.textContent = filename;
  if (fileMetaNode) fileMetaNode.textContent = filename === "README.md" ? "Current document" : "Uploaded file";
}

async function createShare() {
  const content = input.value.trim();
  if (!content) return;
  const passwordProtected = passwordProtect.checked;
  const password = passwordProtected ? passwordInput.value : "";
  if (passwordProtected && !password) {
    alert("Please enter a password or turn off password protection.");
    return;
  }
  createButtons.forEach((button) => (button.disabled = true));
  try {
    const response = await fetch("/api/shares", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        filename: selectedFilename,
        expiration: document.querySelector("#expiration").value,
        burnAfterReading: document.querySelector("#burn-after-reading").checked,
        passwordProtected,
        password,
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
  selectedFilename = file.name || "share.md";
  input.value = await file.text();
  updateFileLabel(selectedFilename);
  updatePreview();
}

input?.addEventListener("input", updatePreview);
createButtons.forEach((button) => button?.addEventListener("click", createShare));
copyShareUrl?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(shareUrlInput.value);
  copyShareUrl.textContent = "✅";
  copyShareUrl.setAttribute("aria-label", "Copied share link");
});
createAnother?.addEventListener("click", () => {
  createdPanel.hidden = true;
  input.value = "";
  shareUrlInput.value = "";
  selectedFilename = "README.md";
  updateFileLabel(selectedFilename);
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

if (createAnother) createAnother.textContent = createAnotherLabel;
updateFileLabel();
updatePreview();
