(() => {
  const $ = (id) => document.getElementById(id);
  const asInput = (el) => el;
  const fields = {
    token: asInput($("token")), slug: asInput($("slug")), title: asInput($("title")),
    description: asInput($("description")), public: asInput($("public")),
    content: asInput($("content")), file: asInput($("file")), status: $("status"), docs: $("docs"),
  };

  fields.token.value = localStorage.getItem("md-share-admin-token") || "";
  fields.token.addEventListener("input", () => localStorage.setItem("md-share-admin-token", fields.token.value));

  const authHeaders = () => ({ "Authorization": `Bearer ${fields.token.value}`, "Content-Type": "application/json" });
  const slugify = (value) => String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
  const setStatus = (message, error = false) => { fields.status.textContent = message; fields.status.dataset.error = error ? "true" : "false"; };

  function parseFrontmatter(text) {
    if (!String(text).startsWith("---\n")) return {};
    const end = text.indexOf("\n---", 4);
    if (end < 0) return {};
    const data = {};
    for (const line of text.slice(4, end).trim().split("\n")) {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) continue;
      data[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
    return data;
  }

  async function loadDocs() {
    const res = await fetch("/api/docs");
    const data = await res.json();
    fields.docs.innerHTML = "";
    for (const doc of data.documents || []) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "doc-item";
      item.innerHTML = `<strong>${doc.title}</strong><span>/p/${doc.slug}/</span>`;
      item.addEventListener("click", () => loadDoc(doc.slug));
      fields.docs.appendChild(item);
    }
    if (!fields.docs.children.length) fields.docs.textContent = "Chưa có bài public nào.";
  }

  async function loadDoc(slug) {
    const res = await fetch(`/api/docs/${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!res.ok) return setStatus(data.error || "Không tải được bài", true);
    const doc = data.document;
    fields.slug.value = doc.slug;
    fields.title.value = doc.title;
    fields.description.value = doc.description || "";
    fields.public.value = doc.public ? "true" : "false";
    fields.content.value = doc.content || "";
    history.replaceState(null, "", `/admin/?edit=${encodeURIComponent(doc.slug)}`);
    setStatus(`Loaded ${doc.slug}`);
  }

  fields.title.addEventListener("input", () => {
    if (!fields.slug.dataset.touched) fields.slug.value = slugify(fields.title.value);
  });
  fields.slug.addEventListener("input", () => { fields.slug.dataset.touched = "true"; fields.slug.value = slugify(fields.slug.value); });
  fields.file.addEventListener("change", async () => {
    const file = fields.file.files && fields.file.files[0];
    if (!file) return;
    const text = await file.text();
    const meta = parseFrontmatter(text);
    fields.content.value = text;
    fields.title.value = meta.title || file.name.replace(/\.(md|markdown)$/i, "");
    fields.description.value = meta.description || "";
    fields.public.value = String(meta.public || "true");
    fields.slug.value = slugify(file.name.replace(/\.(md|markdown)$/i, ""));
    setStatus(`Loaded file ${file.name}`);
  });

  $("editor").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!fields.token.value) return setStatus("Cần admin token", true);
    const payload = {
      slug: fields.slug.value,
      title: fields.title.value,
      description: fields.description.value,
      public: fields.public.value === "true",
      content: fields.content.value,
    };
    const res = await fetch("/api/docs", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) return setStatus(data.error || "Save failed", true);
    setStatus(`Saved. Public link: /p/${data.document.slug}/`);
    await loadDocs();
  });

  $("delete-doc").addEventListener("click", async () => {
    if (!fields.slug.value || !confirm(`Delete ${fields.slug.value}?`)) return;
    const res = await fetch(`/api/docs/${encodeURIComponent(fields.slug.value)}`, { method: "DELETE", headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return setStatus(data.error || "Delete failed", true);
    $("new-doc").click();
    await loadDocs();
    setStatus("Deleted");
  });
  $("new-doc").addEventListener("click", () => {
    fields.slug.value = fields.title.value = fields.description.value = fields.content.value = "";
    fields.public.value = "true";
    delete fields.slug.dataset.touched;
    history.replaceState(null, "", "/admin/");
  });
  $("refresh").addEventListener("click", loadDocs);

  const edit = new URLSearchParams(location.search).get("edit");
  loadDocs().then(() => { if (edit) return loadDoc(edit); return undefined; });
})();
