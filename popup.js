console.log("[POPUP] loaded");
document.getElementById("gen").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "HOTKEY_GENERATE" });
  window.close();
});
