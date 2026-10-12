import mongoose from 'mongoose'
import { withCommon, withOwner } from './base.js'

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, default: 'default' },
  name: { type: String, default: 'GSTOK' },
  tagline: { type: String, default: '' },
  phone: { type: String, default: '+223 93 74 96 34' },
  phone2: { type: String, default: '+226 64 74 73 80' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  currency: { type: String, default: 'XOF' },
  receiptPrefix: { type: String, default: 'REC' },
  receiptFooter: { type: String, default: '' },
  receiptNote: { type: String, default: '' },
  lowStockNotifications: { type: Boolean, default: true },
  negativeStock: { type: Boolean, default: false },
  defaultMinStock: { type: Number, default: 10 },
  theme: { type: String, default: 'light' },
  // Apparence : couleur principale et zoom de l'interface. Ces préférences
  // suivent le compte pour que le poste et le navigateur affichent la même
  // chose pour un même utilisateur.
  accent: { type: String, default: 'green' },
  zoom: { type: Number, default: 100 },
  // Logo de l'entreprise, stocké en data URL (image redimensionnée côté client
  // à 512 px maximum). Le type est volontairement permissif : la validation de
  // format et de poids est faite par le client, et un logo trop lourd est de
  // toute façon rejeté par la limite de taille du corps de requête.
  logo: { type: String, default: '' },
})
settingSchema.index({ ownerId: 1, key: 1 }, { unique: true })
withOwner(settingSchema)
withCommon(settingSchema)

export const Setting = mongoose.model('Setting', settingSchema)