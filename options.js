console.log("[OPTIONS] loaded");
const DEFAULT_PROMPT = "You are a concise LinkedIn assistant. Draft a short, respectful, value-adding comment (2-4 sentences max). No emojis, no hype, no clichés. Mirror the post language (FR/EN). If uncertain, ask 1 sharp question.";

async function load() {
  const { apiKey, model, systemPrompt } = await chrome.storage.local.get(["apiKey","model","systemPrompt"]);
  document.getElementById("apiKey").value = apiKey || "";
  document.getElementById("model").value = model || "openrouter/anthropic/claude-3.5-sonnet";
  document.getElementById("systemPrompt").value = systemPrompt || DEFAULT_PROMPT;
}
async function save() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const model = document.getElementById("model").value.trim();
  const systemPrompt = document.getElementById("systemPrompt").value.trim();
  await chrome.storage.local.set({ apiKey, model, systemPrompt });
  alert("Saved.");
}
async function clearMem() {
  await chrome.storage.local.set({ repliedPosts: {} });
  alert("Mémoire vidée.");
}
document.getElementById("save").addEventListener("click", save);
document.getElementById("clear").addEventListener("click", clearMem);
load();
