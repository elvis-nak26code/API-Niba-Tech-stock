import mongoose from 'mongoose'
import { withCommon, withOwner } from './base.js'

const counterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  value: { type: Number, default: 0 },
})
counterSchema.index({ ownerId: 1, name: 1 }, { unique: true })
withOwner(counterSchema)
withCommon(counterSchema)

export const Counter = mongoose.model('Counter', counterSchema)

// Compteur séquentiel PAR COMPTE : chaque propriétaire a sa propre série de
// références (EN-…, SO-…, REC-…) et ne peut donc jamais entrer en collision
// avec les références d'un autre compte.
export async function nextSequence(name, ownerId) {
  const counter = await Counter.findOneAndUpdate(
    { name, ownerId },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
  return counter.value
}

export function makeReference(prefix, seq) {
  const padded = String(seq).padStart(6, '0')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${prefix}-${date}-${padded}`
}
