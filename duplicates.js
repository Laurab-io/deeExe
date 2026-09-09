// Review page: lists duplicate tab groups and closes the selected ones,
// always keeping one tab (the oldest) per group.

const summaryEl = document.getElementById("summary");
const groupsEl = document.getElementById("groups");
const selectAllBtn = document.getElementById("select-all");
const selectNoneBtn = document.getElementById("select-none");
const closeBtn = document.getElementById("close-selected");

// key -> array of tabs, oldest first
let groups = new Map();

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    let normalized = u.toString();
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return url;
  }
}

async function findDuplicateGroups() {
  const tabs = await chrome.tabs.query({});
  const thisPage = chrome.runtime.getURL("duplicates.html");

  const byUrl = new Map();
  for (const tab of tabs) {
    if (tab.url === thisPage) continue; // don't count the review page itself
    const key = normalizeUrl(tab.url);
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(tab);
  }

  const duplicates = new Map();
  for (const [key, group] of byUrl) {
    if (group.length > 1) {
      // Tab ids increase as tabs are created, so sorting keeps the oldest first.
      group.sort((a, b) => a.id - b.id);
      duplicates.set(key, group);
    }
  }
  return duplicates;
}

function render() {
  groupsEl.textContent = "";

  if (groups.size === 0) {
    summaryEl.textContent = "No duplicate tabs found.";
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nothing to clean up — every open tab has a unique URL.";
    groupsEl.appendChild(empty);
    updateCloseButton();
    return;
  }

  const extraTabs = [...groups.values()].reduce((sum, g) => sum + g.length - 1, 0);
  summaryEl.textContent =
    `${groups.size} duplicate group${groups.size === 1 ? "" : "s"} found — ` +
    `closing all of them would free up ${extraTabs} tab${extraTabs === 1 ? "" : "s"}.`;

  for (const [key, group] of groups) {
    const first = group[0];

    const section = document.createElement("section");
    section.className = "group";

    const header = document.createElement("label");
    header.className = "group-header";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = key;
    checkbox.setAttribute(
      "aria-label",
      `Close duplicates of ${first.title || key} (${group.length} tabs, 1 will stay open)`
    );
    checkbox.addEventListener("change", updateCloseButton);

    const favicon = document.createElement("img");
    favicon.className = "group-favicon";
    favicon.alt = "";
    favicon.src =
      first.favIconUrl && first.favIconUrl.startsWith("http")
        ? first.favIconUrl
        : "icons/icon16.png";

    const meta = document.createElement("div");
    meta.className = "group-meta";

    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = first.title || "(untitled)";

    const url = document.createElement("div");
    url.className = "group-url";
    url.textContent = key;

    meta.append(title, url);

    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `${group.length} tabs`;

    header.append(checkbox, favicon, meta, count);

    const list = document.createElement("ul");
    list.className = "group-tabs";
    group.forEach((tab, i) => {
      const li = document.createElement("li");
      li.textContent = tab.title || tab.url;
      if (i === 0) li.classList.add("kept");
      list.appendChild(li);
    });

    section.append(header, list);
    groupsEl.appendChild(section);
  }

  updateCloseButton();
}

function selectedKeys() {
  return [...groupsEl.querySelectorAll("input[type=checkbox]:checked")].map(
    (cb) => cb.value
  );
}

function updateCloseButton() {
  const selected = selectedKeys();
  const tabsToClose = selected.reduce(
    (sum, key) => sum + (groups.get(key)?.length ?? 1) - 1,
    0
  );
  closeBtn.disabled = selected.length === 0;
  closeBtn.textContent =
    selected.length === 0
      ? "Close selected duplicates"
      : `Close ${tabsToClose} duplicate tab${tabsToClose === 1 ? "" : "s"}`;
}

function setAllCheckboxes(checked) {
  for (const cb of groupsEl.querySelectorAll("input[type=checkbox]")) {
    cb.checked = checked;
  }
  updateCloseButton();
}

selectAllBtn.addEventListener("click", () => setAllCheckboxes(true));
selectNoneBtn.addEventListener("click", () => setAllCheckboxes(false));

closeBtn.addEventListener("click", async () => {
  const idsToClose = [];
  for (const key of selectedKeys()) {
    const group = groups.get(key);
    if (!group) continue;
    // Keep the oldest tab (first in the sorted group), close the rest.
    for (const tab of group.slice(1)) idsToClose.push(tab.id);
  }

  if (idsToClose.length > 0) {
    await chrome.tabs.remove(idsToClose);
  }

  groups = await findDuplicateGroups();
  render();
  summaryEl.textContent =
    `Closed ${idsToClose.length} tab${idsToClose.length === 1 ? "" : "s"}. ` +
    summaryEl.textContent;
});

(async () => {
  groups = await findDuplicateGroups();
  render();
})();
