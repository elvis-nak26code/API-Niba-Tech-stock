import mongoose from 'mongoose'
import { withCommon } from './base.js'

const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
})
withCommon(counterSchema)

export const Counter = mongoose.model('Counter', counterSchema)

export async function nextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
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