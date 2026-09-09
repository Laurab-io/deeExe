// Review page: lists duplicate tab groups and closes the selected ones,
// always keeping one tab (the oldest) per group.

const summaryEl = document.getElementById("summary");
const groupsEl = document.getElementById("groups");
const selectAllBtn = document.getElementById("select-all");
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

// Click-to-open tooltip for truncated titles: works on desktop and touch,
// and is announced to screen readers via aria-expanded + aria-controls.
let tooltipCounter = 0;

function closeAllTooltips() {
  for (const tip of document.querySelectorAll(".title-tooltip:not([hidden])")) {
    tip.hidden = true;
  }
  for (const btn of document.querySelectorAll(".title-toggle[aria-expanded='true']")) {
    btn.setAttribute("aria-expanded", "false");
  }
}

document.addEventListener("click", closeAllTooltips);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAllTooltips();
});

function createTitleWithTooltip(text, className) {
  const wrap = document.createElement("div");
  wrap.className = "title-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `title-toggle ${className}`;
  btn.textContent = text;
  btn.setAttribute("aria-expanded", "false");

  const tip = document.createElement("div");
  tip.className = "title-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.id = `title-tooltip-${++tooltipCounter}`;
  tip.textContent = text;
  tip.hidden = true;

  btn.setAttribute("aria-controls", tip.id);
  btn.addEventListener("click", (e) => {
    // Don't bubble to the surrounding label (would toggle the checkbox)
    // or to the document listener (would immediately close the tooltip).
    e.preventDefault();
    e.stopPropagation();
    const willShow = tip.hidden;
    closeAllTooltips();
    tip.hidden = !willShow;
    btn.setAttribute("aria-expanded", String(willShow));
  });

  wrap.append(btn, tip);
  return wrap;
}

function render() {
  groupsEl.textContent = "";

  if (groups.size === 0) {
    summaryEl.textContent = `${lastAction}No duplicate tabs found.`;
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nothing to clean up — every open tab has a unique URL.";
    groupsEl.appendChild(empty);
    updateCloseButton();
    return;
  }

  const extraTabs = [...groups.values()].reduce((sum, g) => sum + g.length - 1, 0);
  summaryEl.textContent =
    `${lastAction}${groups.size} duplicate group${groups.size === 1 ? "" : "s"} found — ` +
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
    // Only load favicons over HTTPS; fall back to our own icon otherwise.
    favicon.src =
      first.favIconUrl && first.favIconUrl.startsWith("https://")
        ? first.favIconUrl
        : "icons/icon16.png";

    const meta = document.createElement("div");
    meta.className = "group-meta";

    const title = createTitleWithTooltip(first.title || "(untitled)", "group-title");

    // The URL is a real link that opens the page in a new tab.
    // Hovering shows the full URL via the native tooltip.
    // Defense-in-depth: only link out to http(s) URLs; anything else
    // (chrome://, file://, data:, …) is shown as plain text.
    let isLinkable = false;
    try {
      isLinkable = ["http:", "https:"].includes(new URL(first.url).protocol);
    } catch {
      // Unparseable URL — leave it as plain text.
    }

    const url = document.createElement(isLinkable ? "a" : "span");
    url.className = "group-url";
    url.textContent = key;
    url.title = key;
    if (isLinkable) {
      url.href = first.url;
      url.target = "_blank";
      url.rel = "noopener";
      url.addEventListener("click", (e) => {
        // Follow the link, but don't let the click bubble to the
        // surrounding label, which would toggle the group checkbox.
        e.stopPropagation();
      });
    }

    meta.append(title, url);

    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `${group.length} tabs`;

    header.append(checkbox, favicon, meta, count);

    const list = document.createElement("ul");
    list.className = "group-tabs";
    group.forEach((tab, i) => {
      const li = document.createElement("li");

      const tabTitle = createTitleWithTooltip(tab.title || tab.url, "tab-title");

      const status = document.createElement("div");
      status.className = "tab-status" + (i === 0 ? " kept" : "");
      status.textContent = i === 0 ? "Will stay open" : "Will close if selected";

      li.append(tabTitle, status);
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

function allSelected() {
  const checkboxes = groupsEl.querySelectorAll("input[type=checkbox]");
  return checkboxes.length > 0 && selectedKeys().length === checkboxes.length;
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

  // Keep the select-all toggle in sync with the current selection.
  const everythingSelected = allSelected();
  selectAllBtn.textContent = everythingSelected ? "Unselect all" : "Select all";
  selectAllBtn.setAttribute("aria-pressed", String(everythingSelected));
}

function setAllCheckboxes(checked) {
  for (const cb of groupsEl.querySelectorAll("input[type=checkbox]")) {
    cb.checked = checked;
  }
  updateCloseButton();
}

selectAllBtn.addEventListener("click", () => setAllCheckboxes(!allSelected()));

closeBtn.addEventListener("click", async () => {
  const idsToClose = [];
  for (const key of selectedKeys()) {
    const group = groups.get(key);
    if (!group) continue;
    // Keep the oldest tab (first in the sorted group), close the rest.
    for (const tab of group.slice(1)) idsToClose.push(tab.id);
  }

  if (idsToClose.length > 0) {
    lastAction = `Closed ${idsToClose.length} tab${idsToClose.length === 1 ? "" : "s"}. `;
    await chrome.tabs.remove(idsToClose);
  }

  await refresh();
});

// Message prepended to the summary after a close action. Kept in a variable
// so it survives the live re-renders triggered by tab events.
let lastAction = "";

// Re-scan and re-render while preserving the user's current selection.
async function refresh() {
  const previouslySelected = new Set(selectedKeys());
  groups = await findDuplicateGroups();
  render();
  for (const cb of groupsEl.querySelectorAll("input[type=checkbox]")) {
    if (previouslySelected.has(cb.value)) cb.checked = true;
  }
  updateCloseButton();
}

// Live updates: while this page is open it listens to tab events directly,
// so the list stays current without needing a background service worker.
// Events arrive in bursts (e.g. closing several tabs), so debounce briefly.
let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 200);
}

chrome.tabs.onCreated.addListener(scheduleRefresh);
chrome.tabs.onRemoved.addListener(scheduleRefresh);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Only re-scan when a tab's URL changes; ignore loading/favicon churn.
  if (changeInfo.url) scheduleRefresh();
});

refresh();
