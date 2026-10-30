// Opens a file fetched with the admin token in a new tab. The tab is opened straight away, inside the
// click, so pop-up blockers allow it; it shows "Loading..." until the file arrives, then displays it.
export async function openFileInNewTab(loadBlob, label = 'file') {
  const win = window.open('', '_blank');
  if (win) {
    win.document.title = `Opening ${label}...`;
    win.document.body.innerHTML = `<p style="font:16px system-ui,sans-serif;padding:24px;color:#475569">Loading ${label}...</p>`;
  }
  try {
    const url = URL.createObjectURL(await loadBlob());
    if (win) win.location.replace(url);
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (error) {
    win?.close();
    throw error;
  }
}
