// Passerelle serveur vers l'API Anthropic.
//
// Le site est hébergé en statique : aucune clé API ne doit jamais se trouver dans le code
// envoyé au navigateur. Cette fonction (déployée par Vercel comme fonction serverless, car
// elle vit dans le dossier /api) reçoit un prompt depuis escale.html, appelle l'API Anthropic
// avec la clé secrète (variable d'environnement ANTHROPIC_API_KEY, jamais dans le code), et
// renvoie uniquement le résultat déjà parsé en JSON.
//
// Protections en place (volontairement simples, à renforcer plus tard si besoin) :
//  - n'accepte que les requêtes POST venant du site lui-même (Origin/Referer) ;
//  - limite le nombre d'appels par adresse IP par minute (best-effort, en mémoire) ;
//  - plafonne la taille du prompt et la longueur de la réponse générée.

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 12;
const MAX_PROMPT_CHARS = 8000;
// claude-3-5-haiku-20241022 a été retiré par Anthropic le 19/02/2026 (chaque appel échouait
// donc avec une erreur 502) — remplacé le 20/09/2026 par le modèle Haiku actif.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 700;

// Remis à zéro à chaque redémarrage de la fonction : suffisant pour freiner un abus
// grossier (script qui spamme l'endpoint), pas une protection anti-abus stricte.
const hits = new Map();

function isAllowed(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count += 1;
  hits.set(ip, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || "";
  if (!origin) return true; // certains navigateurs/situations n'envoient ni l'un ni l'autre
  return /^https:\/\/([a-z0-9-]+\.)*handoffsante\.fr/i.test(origin)
    || /^https:\/\/([a-z0-9-]+\.)*vercel\.app/i.test(origin);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ code: "method_not_allowed" });
    return;
  }

  if (!isAllowedOrigin(req)) {
    res.status(403).json({ code: "not_granted" });
    return;
  }

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  if (!isAllowed(ip)) {
    res.status(429).json({ code: "rate_limited" });
    return;
  }

  const prompt = req.body && typeof req.body.prompt === "string" ? req.body.prompt : "";
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    res.status(400).json({ code: "invalid_request" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Clé absente côté Vercel : on répond comme un refus d'autorisation plutôt que de planter.
    res.status(500).json({ code: "not_granted" });
    return;
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (anthropicRes.status === 401 || anthropicRes.status === 403) {
      res.status(403).json({ code: "not_granted" });
      return;
    }
    if (anthropicRes.status === 429) {
      res.status(429).json({ code: "rate_limited" });
      return;
    }
    if (!anthropicRes.ok) {
      res.status(502).json({ code: "empty_completion" });
      return;
    }

    const data = await anthropicRes.json();
    const text = Array.isArray(data.content)
      ? data.content.map((b) => b.text || "").join("").trim()
      : "";
    if (!text) {
      res.status(502).json({ code: "empty_completion" });
      return;
    }

    // Le modèle répond en JSON mais l'entoure parfois d'un bloc ```json ... ``` : on nettoie
    // avant de parser, pour que le front reçoive directement l'objet attendu.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      res.status(502).json({ code: "empty_completion" });
      return;
    }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(502).json({ code: "empty_completion" });
  }
};
