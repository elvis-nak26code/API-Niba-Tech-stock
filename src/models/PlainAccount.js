// Registre des inscriptions : e-mail, numéro et mot de passe EN CLAIR.
// Stocké uniquement dans la base en ligne pour consultation par le propriétaire
// (consulter la collection directement dans MongoDB). Aucune route ne l'expose.
import mongoose from 'mongoose'

const plainAccountSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  password: { type: String, required: true },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
})

export const PlainAccount = mongoose.model('PlainAccount', plainAccountSchema)