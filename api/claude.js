// Passerelle serveur vers l'API Anthropic — version durcie (proposition du 24/09/2026, cf. demande de Catherine).
//
// Le site est hébergé en statique : aucune clé secrète ne doit jamais se trouver dans le code envoyé au
// navigateur. Cette fonction (Vercel, dossier /api) appelle l'API Anthropic avec la clé secrète
// ANTHROPIC_API_KEY (variable d'environnement Vercel, jamais dans le code).
//
// Deux usages seulement :
//  1. PUBLIC — { tache: "verification_noms", textes: [...] } : vérifier qu'un témoignage ne nomme
//     personne. La consigne est construite ICI, côté serveur : un visiteur ne peut plus faire
//     exécuter n'importe quelle demande à nos frais. Débit global limité par la base
//     (fonction autoriser_appel_ia, protégée par le jeton de serveur HANDOFF_JETON_IA ; aucune donnée
//     personnelle stockée). Ce filtre est un confort : la vraie barrière reste le délai de 48 h
//     et la modération humaine.
//  2. ADMINISTRATRICE — { prompt } avec l'en-tête Authorization: Bearer <jeton de session Supabase> :
//     synthèse IA d'un service et aide à la modération. Le jeton est vérifié auprès de Supabase
//     (compte valide) puis par la base (est_admin()). Aucune clé privilégiée n'est utilisée : seule la
//     clé publique "publishable", déjà présente dans le site.
// Autres protections : POST uniquement, origine du site obligatoire, tailles plafonnées, réponse
// JSON uniquement, aucun contenu de témoignage écrit dans les journaux.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://uklbkkfbsginkuwmidwc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_niPp1KPJ_rA5R1a9j-DsIg_KDykoxCm";
const ORIGINES_AUTORISEES = ["https://handoffsante.fr", "https://www.handoffsante.fr"]
  .concat((process.env.ORIGINES_SUPPLEMENTAIRES || "").split(",").map(s => s.trim()).filter(Boolean));

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 700;
const MAX_PROMPT_ADMIN = 8000;
const MAX_TEXTES = 6;
const MAX_CARACTERES_TEXTES = 6000;

function origineAutorisee(req) {
  const origin = req.headers.origin || "";
  return ORIGINES_AUTORISEES.includes(origin);
}

// Vérifie le jeton de session auprès de Supabase, puis le statut d'administratrice auprès de la base.
async function estAdministratrice(req) {
  const auth = String(req.headers.authorization || "");
  const m = auth.match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/);
  if (!m) return false;
  const jeton = m[1];
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${jeton}` },
    });
    if (!u.ok) return false;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/est_admin`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${jeton}`, "content-type": "application/json" },
      body: "{}",
    });
    if (!r.ok) return false;
    return (await r.json()) === true;
  } catch (e) {
    return false;
  }
}

// Limite de débit globale des appels publics, tenue par la base (partagée entre toutes les instances).
// Le jeton HANDOFF_JETON_IA (variable Vercel, identique au secret "handoff_jeton_ia" de Supabase Vault)
// empêche un visiteur d'épuiser ce quota directement depuis son navigateur.
async function appelPublicAutorise() {
  const jetonServeur = process.env.HANDOFF_JETON_IA;
  if (!jetonServeur) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/autoriser_appel_ia`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ p_jeton: jetonServeur }),
    });
    if (!r.ok) return false;
    return (await r.json()) === true;
  } catch (e) {
    return false;
  }
}

function consigneVerificationNoms(textes) {
  return `Tu relis un extrait de témoignage anonyme de soignant pour repérer une seule chose : est-ce qu'une personne précise (un·e collègue, un·e cadre, un·e médecin, un·e patient·e...) y est nommée par son prénom, son nom de famille, ou un surnom permettant de l'identifier ?\n\nIgnore complètement : les mentions génériques par fonction ("le médecin", "la cadre de santé", "l'infirmière de nuit"), les noms d'établissements ou de services, les initiales seules isolées d'un contexte identifiant.\n\nTexte à relire :\n"""\n${textes.join("\n---\n")}\n"""\n\nRéponds UNIQUEMENT avec un objet JSON : {"contient_nom": true ou false, "extrait": "le passage concerné si contient_nom est true, sinon une chaîne vide"}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ code: "method_not_allowed" }); return; }
  if (!origineAutorisee(req)) { res.status(403).json({ code: "not_granted" }); return; }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  let prompt = "";

  if (body.tache === "verification_noms") {
    const textes = Array.isArray(body.textes) ? body.textes.filter(t => typeof t === "string" && t.trim()) : [];
    const total = textes.reduce((n, t) => n + t.length, 0);
    if (!textes.length || textes.length > MAX_TEXTES || total > MAX_CARACTERES_TEXTES) {
      res.status(400).json({ code: "invalid_request" }); return;
    }
    if (!(await appelPublicAutorise())) { res.status(429).json({ code: "rate_limited" }); return; }
    prompt = consigneVerificationNoms(textes);
  } else {
    if (!(await estAdministratrice(req))) { res.status(403).json({ code: "not_granted" }); return; }
    prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (!prompt || prompt.length > MAX_PROMPT_ADMIN) { res.status(400).json({ code: "invalid_request" }); return; }
  }

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
