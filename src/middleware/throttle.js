// Limitation d'essais sur les points d'authentification sensibles.
//
// Sans cela, le mot de passe par défaut de la plateforme (`admin1234`) peut être
// deviné par force brute en quelques secondes. Deux compteurs sont tenus, par
// adresse IP et par identifiant visé, pour qu'une attaque depuis une seule IP ne
// puisse ni tester beaucoup d'identifiants, ni marteler le même compte.
//
// Volontairement en mémoire : l'API est un service mono-processus, et un
// redémarrage ne doit pas verrouiller durablement l'exploitant. Une limitation
// distribuée nécessiterait un stockage partagé (Redis) — hors périmètre ici.

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

const buckets = new Map()

function hit(key) {
  const now = Date.now()
  const entry = buckets.get(key)
  if (!entry || now > entry.resetAt) {
    const fresh = { count: 1, resetAt: now + WINDOW_MS }
    buckets.set(key, fresh)
    return fresh
  }
  entry.count += 1
  return entry
}

function blocked(key) {
  const entry = buckets.get(key)
  if (!entry) return null
  if (Date.now() > entry.resetAt) {
    buckets.delete(key)
    return null
  }
  if (entry.count >= MAX_ATTEMPTS) return entry
  return null
}

function clear(key) {
  buckets.delete(key)
}

// Nettoyage périodique pour éviter que la table ne grandisse indéfiniment.
// `unref()` pour ne pas empêcher un arrêt propre du processus.
const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of buckets) if (now > entry.resetAt) buckets.delete(key)
}, WINDOW_MS)
sweeper.unref?.()

/**
 * Renvoie un middleware qui compte les tentatives par IP et par identifiant.
 * À placer AVANT le contrôleur de connexion. Un succès remet les compteurs à zéro.
 */
export function loginThrottle(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'inconnu'
  const identifier = String(req.body?.identifier || '').trim().toLowerCase()
  const keys = [`ip:${ip}`, identifier ? `id:${identifier}` : null].filter(Boolean)

  for (const key of keys) {
    const entry = blocked(key)
    if (entry) {
      const retry = Math.ceil((entry.resetAt - Date.now()) / 1000)
      res.set('Retry-After', String(retry))
      return res.status(429).json({
        ok: false,
        message: 'Trop de tentatives. Réessayez dans quelques minutes.',
        code: 'TOO_MANY_ATTEMPTS',
      })
    }
  }

  // On réinitialise après coup si le contrôleur répond 200.
  const originalJson = res.json.bind(res)
  res.json = (body) => {
    if (res.statusCode === 200) for (const key of keys) clear(key)
    else for (const key of keys) hit(key)
    return originalJson(body)
  }

  return next()
}
