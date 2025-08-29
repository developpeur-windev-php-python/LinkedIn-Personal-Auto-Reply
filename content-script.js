// content-script.js
// ===============================================
// LinkedIn Personal Auto-Reply — Content Script
// - MV3 compatible
// - Logs détaillés [CS]
// - Sélecteurs robustes (fallbacks LinkedIn)
// - Messaging vers background avec try/catch
// - Insertion du brouillon à la position du caret
// ===============================================

console.log("[CS] loaded");
pingBackground(); // vérifie que le SW répond
showToast("Extension chargée (Alt+G pour générer)");

// ---------- Utils ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let toastEl = null;
function showToast(msg) {
  try {
    if (!toastEl) {
      toastEl = document.createElement("div");
      Object.assign(toastEl.style, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        background: "#111",
        color: "#fff",
        padding: "10px 12px",
        borderRadius: "8px",
        fontSize: "12px",
        zIndex: "2147483647",
        transition: "opacity .3s"
      });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    setTimeout(() => { if (toastEl) toastEl.style.opacity = "0"; }, 2000);
  } catch {}
}

async function sendToBG(payload) {
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (e) {
    console.warn("[CS] sendMessage failed:", e);
    showToast("Background inactif. Recharge l’extension + la page.");
    return null;
  }
}

async function pingBackground() {
  const r = await sendToBG({ type: "PING" });
  console.log("[CS] PING ->", r);
}


// 1) Nettoyage du bruit UI LinkedIn FR
function stripUiNoise(t) {
  const trash = [
    "J’aime", "Commenter", "Republier", "Envoyer",
    "Afficher la traduction", "… plus", "Les plus pertinents",
    "Visible de tous sur LinkedIn et en dehors", "Activer pour voir l’image en plus grand",
    "Post du fil d’actualité"
  ];
  let out = t;
  for (const k of trash) out = out.replace(new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\b", "g"), "");
  return out;
}

// 2) Viser au mieux le bloc “contenu de post”
function extractPostOnlyText(root) {
  const el =
    root.querySelector('.update-components-text') ||
    root.querySelector('.update-components-update-v2__commentary') ||
    root.querySelector('.feed-shared-inline-show-more-text') ||
    root.querySelector('[data-test-id="post-content"]');
  let txt = (el?.textContent || "").trim();
  if (!txt) return "";
  txt = txt.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return stripUiNoise(txt);
}


// ---------- DOM helpers ----------
let lastActiveEditable = null;

function getActiveEditable() {
  const ae = document.activeElement;
  if (ae && ae.closest && !ae.closest('body')) { // Ignore body focus
    const isEditable =
      (ae.getAttribute("contenteditable") === "true" || ae.isContentEditable) &&
      (ae.getAttribute("role") === "textbox" || ae.closest('[role="textbox"]'));
    if (isEditable) return ae;
  }
  // Fallback to the last known editable element
  if (lastActiveEditable && document.body.contains(lastActiveEditable)) {
    return lastActiveEditable;
  }
  return null;
}

// Elargit la recherche du conteneur du post (LinkedIn change souvent)
function findPostRoot(node) {
  if (!node?.closest) return null;
  return (
    node.closest('[data-urn^="urn:li:activity:"]') ||
    node.closest('[data-urn*="activity"]') ||
    node.closest('div[role="article"]') ||
    node.closest('article') ||
    node.closest('.feed-shared-update-v2') ||
    node.closest('[data-urn]') ||
    null
  );
}

function extractPostText(root) {
  if (!root) return "";
  let txt = root.textContent || "";
  txt = txt.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (txt.length > 8000) txt = txt.slice(0, 8000) + "\n...[truncated]";
  return txt;
}

function getUrn(root) {
  if (!root) return null;
  const urn =
    root.getAttribute("data-urn") ||
    root.querySelector("[data-urn]")?.getAttribute("data-urn");
  if (urn) return urn;
  // fallback hash si pas d'URN dispo
  const text = extractPostText(root);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return "hash:" + hash.toString(16);
}

// ---------- Core ----------
async function generateForActiveBox() {
  console.log("[CS] generateForActiveBox()");
  const box = getActiveEditable();
  if (!box) {
    showToast("Place le curseur dans la zone commentaire.");
    console.warn("[CS] no active editable");
    return;
  }

  const root = findPostRoot(box);
  if (!root) {
    showToast("Post introuvable (sélecteurs). Clique dans le post puis dans la zone.");
    console.warn("[CS] post root not found");
    return;
  }

  const urn = getUrn(root);
  const fullText = extractPostText(root);

  const postText = extractPostOnlyText(root) || fullText;
  console.log("[CS] POST-ONLY TEXT (preview):\n", postText.slice(0, 1000));


  const snippet = fullText.slice(0, 400);
  console.log("[CS] URN:", urn, "textLen:", fullText.length);

  // Affiche un message temporaire
  insertTextAtCaret(box, "Réponse en cours...");

  // NEW: log du texte envoyé (aperçu tronqué pour la console)
  const maxLog = 3000; // ajuste à ton goût
  const preview = fullText.length > maxLog
    ? fullText.slice(0, maxLog) + "\n...[truncated]"
    : fullText;
  console.log("[CS] TEXT SENT TO OPENROUTER:\n" + preview);


  const resp = await sendToBG({
    type: "GENERATE_REPLY",
    urn,
    fullText,
    postText,      // <-- nouveau
    contextSnippet: snippet
  });
  if (!resp) return; // background KO

  console.log("[CS] Received from background:", resp);

  if (!resp.ok) {
    console.warn("[CS] BG error:", resp);
    if (resp.error === "ALREADY_REPLIED") showToast("Déjà marqué traité.");
    else if (resp.error === "NO_API_KEY") showToast("Renseigne la clé OpenRouter dans Options.");
    else showToast("Erreur API / background. Voir console.");
    return;
  }

  insertTextAtCaret(box, resp.draft);
  showControls(box, urn);
}

function insertTextAtCaret(editable, text) {
  editable.focus();

  // Vider le contenu existant de manière fiable
  let targetNode = editable.querySelector('p') || editable;
  while (targetNode.firstChild) {
    targetNode.removeChild(targetNode.firstChild);
  }

  // Insérer le nouveau texte et placer le curseur à la fin
  const textNode = document.createTextNode(text);
  targetNode.appendChild(textNode);

  // Déplacer le curseur à la fin du texte inséré
  const range = document.createRange();
  const sel = window.getSelection();
  range.setStart(targetNode, 1);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  editable.focus(); // Re-focus pour s'assurer que le curseur est visible
}

// ---------- UI mini-contrôles ----------
let controlsEl = null;

function showControls(anchorEl, urn) {
  hideControls();
  controlsEl = document.createElement("div");
  Object.assign(controlsEl.style, {
    position: "absolute",
    zIndex: "2147483647",
    background: "#fff",
    border: "1px solid #ddd",
    borderRadius: "8px",
    padding: "6px 8px",
    boxShadow: "0 4px 12px rgba(0,0,0,.12)",
    fontSize: "12px"
  });
  controlsEl.innerHTML = `
    <button id="li-accept">✅ Valider (marquer traité)</button>
    <button id="li-regenerate">🔁 Regénérer</button>
    <button id="li-cancel">❌ Fermer</button>
  `;
  document.body.appendChild(controlsEl);
  positionControls(anchorEl, controlsEl);

  controlsEl.querySelector("#li-accept").addEventListener("click", async () => {
    await sendToBG({ type: "MARK_REPLIED", urn });
    showToast("Marqué traité ✅");
    hideControls();
  });
  controlsEl.querySelector("#li-regenerate").addEventListener("click", async () => {
    hideControls();
    await sleep(50);
    generateForActiveBox();
  });
  controlsEl.querySelector("#li-cancel").addEventListener("click", hideControls);

  const onScroll = () => positionControls(anchorEl, controlsEl);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  controlsEl._cleanup = () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}

function positionControls(anchorEl, controls) {
  const rect = anchorEl.getBoundingClientRect();
  const top = window.scrollY + rect.top - controls.offsetHeight - 8;
  const left = window.scrollX + rect.left;
  controls.style.top = Math.max(8, top) + "px";
  controls.style.left = Math.max(8, left) + "px";
}

function hideControls() {
  if (controlsEl) {
    controlsEl._cleanup?.();
    controlsEl.remove();
    controlsEl = null;
  }
}

// ---------- Listeners ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "HOTKEY_GENERATE") {
    console.log("[CS] HOTKEY_GENERATE");
    generateForActiveBox();
  }
});

document.addEventListener("focusin", (e) => {
  const target = e.target;
  if (target && (target.getAttribute("contenteditable") === "true" || target.closest('[role="textbox"]'))) {
    lastActiveEditable = target;
    showToast("Alt+G pour générer un brouillon.");
  }
});
