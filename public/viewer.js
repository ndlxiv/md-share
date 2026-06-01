import { renderMarkdown } from "./render.js";

const article = document.querySelector("#markdown-preview");
const passwordForm = document.querySelector("#password-form");
const passwordInput = document.querySelector("#view-password");
const passwordError = document.querySelector("#password-error");
const id = new URLSearchParams(location.search).get("id");

const messages = {
  not_found: "This share does not exist or has already been burned.",
  expired: "This share has expired.",
  default: "Could not load this share.",
};

function showMessage(text) {
  passwordForm.hidden = true;
  article.hidden = false;
  article.classList.add("muted-preview");
  article.textContent = text;
}

function render(data) {
  passwordForm.hidden = true;
  article.hidden = false;
  article.classList.remove("muted-preview");
  article.innerHTML = renderMarkdown(data.content);
  if (data.filename) document.title = `${data.filename} · MDShare`;
}

async function load(password) {
  const res = await fetch(`/api/shares/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(password ? { password } : {}),
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && data.passwordRequired) {
    article.hidden = true;
    passwordForm.hidden = false;
    passwordError.textContent = password ? "Wrong password, try again." : "";
    passwordInput.focus();
    return;
  }
  if (!res.ok) {
    showMessage(messages[data.error] || messages.default);
    return;
  }
  render(data);
}

passwordForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (passwordInput.value) load(passwordInput.value);
});

if (!id) {
  showMessage("No share id provided.");
} else {
  load();
}
