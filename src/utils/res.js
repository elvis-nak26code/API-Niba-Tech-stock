// Encapsule un handler async pour propager les erreurs vers errorHandler.
export const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data })

// Normalise un document (lean ou toObject) en objet API : { id } sans _id/__v.
export function apiDoc(doc) {
  if (!doc) return null
  const { _id, __v, ...rest } = { ...doc }
  return { ...rest, id: doc.id !== undefined ? doc.id : _id !== undefined ? _id.toString() : null }
}

export function userLabel(req) {
  return req?.user?.fullName || '—'
}

export function nowDate() {
  return new Date()
}