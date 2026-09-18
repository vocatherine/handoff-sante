// Service worker minimal, requis par Chrome/Android pour proposer l'installation de l'appli
// ("beforeinstallprompt" ne se déclenche jamais sans service worker enregistré avec un
// gestionnaire "fetch"). Il ne fait volontairement AUCUN cache offline : l'appli s'appuie sur des
// données à jour (Supabase) et sur l'API IA, donc mieux vaut échouer clairement hors-ligne que de
// servir silencieusement une version périmée.
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", () => {
  // Laisse passer toutes les requêtes vers le réseau normalement (pas d'interception).
});
