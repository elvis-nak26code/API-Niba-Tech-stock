const hiddenFields = ['_id', '__v', 'passwordHash', 'password']

export function jsonTransform(_doc, ret) {
  if (ret._id) ret.id = ret._id.toString()
  for (const k of hiddenFields) delete ret[k]
  return ret
}

// Applique une sérialisation JSON cohérente (id au lieu de _id) + timestamps.
export function withCommon(schema, extraPick = (ret) => ret) {
  schema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => extraPick(jsonTransform(doc, ret)) })
  schema.set('toObject', { virtuals: true, versionKey: false, transform: (doc, ret) => extraPick(jsonTransform(doc, ret)) })
  schema.set('timestamps', { createdAt: true, updatedAt: true })
}