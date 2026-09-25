const hiddenFields = ['_id', '__v', 'passwordHash', 'password']

export function jsonTransform(_doc, ret) {
  if (ret._id) ret.id = ret._id.toString()
  for (const k of hiddenFields) delete ret[k]
  return ret
}

// Champ multi-tenant commun à toutes les collections métier : chaque document
// appartient au propriétaire qui l'a créé (req.user.id). Toutes les requêtes
// doivent filtrer sur cet identifiant pour garantir des données par compte.
export function withOwner(schema) {
  schema.add({
    ownerId: { type: String, required: true, index: true },
  })
}

// Applique une sérialisation JSON cohérente (id au lieu de _id) + timestamps.
export function withCommon(schema, extraPick = (ret) => ret) {
  schema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => extraPick(jsonTransform(doc, ret)) })
  schema.set('toObject', { virtuals: true, versionKey: false, transform: (doc, ret) => extraPick(jsonTransform(doc, ret)) })
  schema.set('timestamps', { createdAt: true, updatedAt: true })
}