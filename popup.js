// Popup: shows a quick duplicate count and opens the review page.

const statusEl = document.getElementById("status");
const buttonEl = document.getElementById("find-duplicates");

// Normalize URLs so trivial differences (trailing slash, hash) don't
// prevent duplicates from matching.
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

async function updateStatus() {
  const tabs = await chrome.tabs.query({});
  const counts = new Map();
  for (const tab of tabs) {
    const key = normalizeUrl(tab.url);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const duplicateGroups = [...counts.values()].filter((n) => n > 1).length;
  const extraTabs = [...counts.values()]
    .filter((n) => n > 1)
    .reduce((sum, n) => sum + (n - 1), 0);

  if (duplicateGroups === 0) {
    statusEl.textContent = "No duplicate tabs found. You're all clean!";
  } else {
    statusEl.textContent =
      `Found ${duplicateGroups} duplicate group${duplicateGroups === 1 ? "" : "s"} ` +
      `(${extraTabs} extra tab${extraTabs === 1 ? "" : "s"}).`;
  }
}

buttonEl.addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("duplicates.html") });
  window.close();
});

updateStatus();
