// background.js (MV3)
console.log("[BG] service worker up");

const DEFAULTS = {
  model: "openrouter/anthropic/claude-3.5-sonnet",
  systemPrompt:
    "You are a concise LinkedIn assistant. Draft a short, respectful, value-adding comment (2-4 sentences max). No emojis, no hype, no clichés. Mirror the post language (FR/EN). If uncertain, ask 1 sharp question.",
  referer: "https://local-extension",
  title: "LinkedIn Personal Auto-Reply"
};

async function getSettings() {
  const { apiKey, model, systemPrompt, repliedPosts = {} } =
    await chrome.storage.local.get(["apiKey","model","systemPrompt","repliedPosts"]);
  return {
    apiKey,
    model: model || DEFAULTS.model,
    systemPrompt: systemPrompt || DEFAULTS.systemPrompt,
    repliedPosts
  };
}
async function setReplied(urn) {
  const { repliedPosts = {} } = await chrome.storage.local.get("repliedPosts");
  repliedPosts[urn] = { ts: Date.now() };
  await chrome.storage.local.set({ repliedPosts });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // Sanity ping
    if (msg.type === "PING") {
      console.log("[BG] PING from", sender.tab?.id);
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "GENERATE_REPLY") {
      console.log("[BG] GENERATE_REPLY URN:", msg.urn);
      const { apiKey, model, systemPrompt, repliedPosts } = await getSettings();
      if (!apiKey) { sendResponse({ ok:false, error:"NO_API_KEY" }); return; }
      if (msg.urn && repliedPosts[msg.urn]) {
        sendResponse({ ok:false, error:"ALREADY_REPLIED", data:{ when: repliedPosts[msg.urn].ts }});
        return;
      }
      

      const bodyText = msg.postText || msg.fullText || "";
      const lang = msg.langGuess && msg.langGuess !== "auto" ? msg.langGuess : "auto";

      const languageDirective =
        lang === "es" ? "Responde en español." :
        lang === "fr" ? "Réponds en français." :
        lang === "en" ? "Reply in English." :
        "Reply in the exact language of the post.";

      // Log utile
      console.log("[BG] Text len:", bodyText.length, "langGuess:", lang);
      console.debug("[BG] TEXT PAYLOAD (preview):\n", bodyText);

      

      const userContent = [
        `LANGUAGE: ${lang}`,
        languageDirective,
        "",
        "POST TEXT:",
        bodyText,
        "",
        "TASK:",
        "Write a single professional LinkedIn comment that validates the author's point, extends it with internal linking/site architecture expertise (authority distribution, topical authority, ROI).",
        "One emoji max (optional). End with 4–5 relevant hashtags; the last must always be #djagryn."
      ].join("\n");

      try {
        const maxLog = 4000; // évite de spammer la console
        console.groupCollapsed(`[BG] userContent (len=${userContent.length})`);
        console.debug(
          userContent.length > maxLog
            ? userContent.slice(0, maxLog) + "\n...[truncated]"
            : userContent
        );
        console.groupEnd();
      } catch (e) {
        console.warn("[BG] userContent log failed:", e);
      }

      try {

        console.log("[BG] Will call OpenRouter. Text length:", (msg.fullText || "").length);
        const maxLog = 3000;
        const preview = (msg.fullText || "").slice(0, maxLog);
        console.debug("[BG] TEXT PAYLOAD (preview):\n", preview);

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": DEFAULTS.referer,
            "X-Title": DEFAULTS.title
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `FULL POST:\n${msg.fullText}\n\nTASK: Short, natural LinkedIn comment (<= ~60 words).` }
            ],
            temperature: 0.5,
            top_p: 0.95
          })
        });
        if (!res.ok) {
          const t = await res.text().catch(()=> "");
          console.warn("[BG] OpenRouter HTTP", res.status, t);
          sendResponse({ ok:false, error:"OPENROUTER_ERROR", details:t });
          return;
        }
        const data = await res.json();
        const draft = data?.choices?.[0]?.message?.content?.trim?.() || "";
        sendResponse({ ok:true, draft });
      } catch (e) {
        console.error("[BG] NETWORK_ERROR", e);
        sendResponse({ ok:false, error:"NETWORK_ERROR", details:String(e) });
      }
    }

    if (msg.type === "MARK_REPLIED" && msg.urn) {
      await setReplied(msg.urn);
      sendResponse({ ok:true });
    }
  })();

  // IMPORTANT pour les réponses async
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "generate-comment") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "HOTKEY_GENERATE" });
});
