(() => {
  const grid = document.getElementById("dynamic-shares");
  const empty = document.getElementById("empty");
  if (!grid || !empty) return;
  fetch("/api/docs")
    .then((res) => res.ok ? res.json() : Promise.reject(new Error("API unavailable")))
    .then((data) => {
      const docs = data.documents || [];
      grid.innerHTML = "";
      empty.hidden = docs.length > 0;
      for (const doc of docs) {
        const a = document.createElement("a");
        a.className = "card";
        a.href = `/p/${doc.slug}/`;
        a.innerHTML = `<h2>${doc.title}</h2>${doc.description ? `<p>${doc.description}</p>` : ""}<span class="meta">Open /p/${doc.slug}</span>`;
        grid.appendChild(a);
      }
    })
    .catch(() => {
      empty.hidden = grid.children.length > 0;
    });
})();
