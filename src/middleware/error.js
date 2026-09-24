const HttpError = (message, status = 500) => Object.assign(new Error(message), { status, expose: true })
const NotFound = (msg = 'Ressource introuvable.') => HttpError(msg, 404)

export { HttpError, NotFound }

export function notFound(_req, _res, next) {
  next(NotFound('Route introuvable.'))
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500
  const message = err.expose || status < 500 ? err.message : 'Erreur interne du serveur.'
  if (status >= 500) console.error('[error]', err)
  if (err.name === 'ValidationError') {
    const msg = Object.values(err.errors || {}).map((e) => e.message).join(' ')
    return res.status(400).json({ ok: false, message: msg || message })
  }
  if (err.code === 11000) {
    return res.status(409).json({ ok: false, message: 'Un enregistrement existe déjà avec cette valeur unique.' })
  }
  res.status(status).json({ ok: false, message })
}