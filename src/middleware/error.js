const HttpError = (message, status = 500) => Object.assign(new Error(message), { status, expose: true })
const NotFound = (msg = 'Ressource introuvable.') => HttpError(msg, 404)

export { HttpError, NotFound }

export function notFound(_req, _res, next) {
  next(NotFound('Route introuvable.'))
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500
  const message = err.expose || status < 500 ? err.message : 'Erreur interne du serveur.'
  // Le code d'erreur applicatif doit atteindre le client : c'est lui qui permet
  // au web comme au mobile de distinguer un blocage de compte d'une simple
  // erreur d'affichage. On ne l'expose que s'il s'agit bien d'un code texte
  // posé volontairement (les codes numériques de Mongo restent internes).
  const code = typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code) ? err.code : undefined
  const payload = { ok: false, message, ...(code ? { code } : {}) }
  if (status >= 500) console.error('[error]', err)
  if (err.name === 'ValidationError') {
    const msg = Object.values(err.errors || {}).map((e) => e.message).join(' ')
    return res.status(400).json({ ...payload, message: msg || message })
  }
  if (err.code === 11000) {
    return res.status(409).json({ ...payload, message: 'Un enregistrement existe déjà avec cette valeur unique.' })
  }
  res.status(status).json(payload)
}