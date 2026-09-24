// Passerelle serveur vers l'API Anthropic — version INTERMÉDIAIRE (proposition du 24/09/2026,
// cf. relecture de sécurité : la version en ligne exécutait n'importe quelle demande à nos frais).
//
// À mettre en ligne AVANT la solution durable, sans rien changer au site ni à la base :
//  - seule la vérification des noms propres, envoyée par le site actuel, est acceptée : la demande
//    doit avoir exactement la forme de la consigne du site ; seul le texte à relire est repris, et
//    la consigne est reconstruite ICI, côté serveur ;
//  - toute autre demande est refusée (synthèse IA et aide à la modération, déjà suspendues, restent
//    indisponibles jusqu'à la solution durable, qui les réserve à l'administratrice connectée) ;
//  - origine du site obligatoire, limite par adresse en mémoire (freine seulement les abus grossiers).
// La clé ANTHROPIC_API_KEY reste une variable d'environnement Vercel, jamais dans le code.

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 12;
const MAX_CARACTERES_TEXTES = 6000;
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 300;
const ORIGINES_AUTORISEES = ["https://handoffsante.fr", "https://www.handoffsante.fr"];

const DEBUT = `Tu relis un extrait de témoignage anonyme de soignant pour repérer une seule chose : est-ce qu'une personne précise (un·e collègue, un·e cadre, un·e médecin, un·e patient·e...) y est nommée par son prénom, son nom de famille, ou un surnom permettant de l'identifier ?\n\nIgnore complètement : les mentions génériques par fonction ("le médecin", "la cadre de santé", "l'infirmière de nuit"), les noms d'établissements ou de services, les initiales seules isolées d'un contexte identifiant.\n\nTexte à relire :\n"""\n`;
const FIN = `\n"""\n\nRéponds UNIQUEMENT avec un objet JSON : {"contient_nom": true ou false, "extrait": "le passage concerné si contient_nom est true, sinon une chaîne vide"}`;

const hits = new Map();
function isAllowed(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_LIMIT_WINDOW_MS; }
  entry.count += 1;
  hits.set(ip, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ code: "method_not_allowed" }); return; }
  if (!ORIGINES_AUTORISEES.includes(req.headers.origin || "")) { res.status(403).json({ code: "not_granted" }); return; }

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "inconnu").split(",")[0].trim();
  if (!isAllowed(ip)) { res.status(429).json({ code: "rate_limited" }); return; }

  // Seule la vérification des noms est acceptée : on n'en garde que le texte à relire.
  const recu = req.body && typeof req.body.prompt === "string" ? req.body.prompt : "";
  if (!recu.startsWith(DEBUT) || !recu.endsWith(FIN)) { res.status(403).json({ code: "not_granted" }); return; }
  const texte = recu.slice(DEBUT.length, recu.length - FIN.length);
  if (!texte.trim() || texte.length > MAX_CARACTERES_TEXTES) { res.status(400).json({ code: "invalid_request" }); return; }
  const prompt = DEBUT + texte + FIN;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ code: "not_granted" }); return; }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages: [{ role: "user", content: prompt }] }),
    });
    if (anthropicRes.status === 401 || anthropicRes.status === 403) { res.status(403).json({ code: "not_granted" }); return; }
    if (anthropicRes.status === 429) { res.status(429).json({ code: "rate_limited" }); return; }
    if (!anthropicRes.ok) { res.status(502).json({ code: "empty_completion" }); return; }
    const data = await anthropicRes.json();
    const text = Array.isArray(data.content) ? data.content.map((b) => b.text || "").join("").trim() : "";
    if (!text) { res.status(502).json({ code: "empty_completion" }); return; }
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch (e) { res.status(502).json({ code: "empty_completion" }); return; }
    res.status(200).json(parsed);
  } catch (e) {
    res.status(502).json({ code: "empty_completion" });
  }
};
