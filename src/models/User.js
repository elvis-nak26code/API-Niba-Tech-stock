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

  // ---- Administration ----------------------------------------------------
  // Le PREMIER compte créé devient super administrateur (voir auth.controller).
  // `isSuperAdmin` lui seul donne accès à l'espace Admin et à la gestion des
  // rôles administrateur ; le rôle 'Administrateur' ouvre l'espace Admin sans
  // permettre de nommer ou révoquer un super administrateur.
  isSuperAdmin: { type: Boolean, default: false },

  // Blocage d'un compte, appliqué CÔTÉ SERVEUR à chaque requête authentifiée.
  //   blockStartsAt : début du blocage (null ou date passée = immédiat)
  //   blockEndsAt   : fin du blocage (null = indéfini, jusqu'à déblocage manuel)
  // Les deux champs permettent un blocage immédiat, un blocage programmé, une
  // durée (1 h, 6 h, 12 h, 1 jour, personnalisée) et un déblocage programmé.
  blockStartsAt: { type: Date, default: null },
  blockEndsAt: { type: Date, default: null },
  blockReason: { type: String, default: '' },
  blockedAt: { type: Date, default: null },
  blockedBy: { type: String, default: '' },

  // Fréquence d'utilisation (affichée dans l'espace Admin).
  loginCount: { type: Number, default: 0 },
  lastLoginAt: { type: Date, default: null },
  lastActivityAt: { type: Date, default: null },
})

withCommon(userSchema, (ret) => {
  ret.fullName = `${ret.firstName || ''} ${ret.lastName || ''}`.trim()
  return ret
})

export const User = mongoose.model('User', userSchema)
