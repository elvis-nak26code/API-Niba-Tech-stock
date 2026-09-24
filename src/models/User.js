import mongoose from 'mongoose'
import { withCommon } from './base.js'

const userSchema = new mongoose.Schema({
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['Administrateur', 'Gestionnaire', 'Caissier', 'Employé'], default: 'Employé' },
  company: { type: String, default: '' },
  active: { type: Boolean, default: true },
})

withCommon(userSchema, (ret) => {
  ret.fullName = `${ret.firstName || ''} ${ret.lastName || ''}`.trim()
  return ret
})

export const User = mongoose.model('User', userSchema)