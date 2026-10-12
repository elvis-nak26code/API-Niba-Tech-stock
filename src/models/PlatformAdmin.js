import mongoose from 'mongoose'
import { withCommon } from './base.js'

// Compte de la PLATEFORME d'administration — distinct des comptes de
// l'application.
//
// L'espace Admin sert au développeur à surveiller l'usage fait par les
// utilisateurs du logiciel. Il ne doit donc PAS être un compte applicatif :
//   - il n'apparaît dans aucune liste d'utilisateurs, aucun blocage, aucune
//     gestion de rôles ne le concerne ;
//   - il ne provisions aucune donnée de gestion (paramètres, catégories) ;
//   - sa suppression n'entraîne pas la perte de l'accès à l'administration.
//
// Son jeton porte `scope: 'platform'` : `requireAuth` (qui résout un
// `User`) le refuse, et inversement le jeton d'un utilisateur ne peut pas
// ouvrir cette plateforme. Les deux espaces ne se croisent pas.
const platformAdminSchema = new mongoose.Schema({
  // Identifiant de connexion. Volontairement un identifiant court (« admin »)
  // et non un e-mail : ce n'est pas une personne, c'est l'exploitant.
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },

  passwordHash: { type: String, required: true },

  active: { type: Boolean, default: true },

  // Incrémenté à chaque changement de mot de passe. Il figure dans le jeton :
  // tous les jetons délivrés avec l'ancien numéro deviennent refusés, sans
  // avoir à énumérer des sessions.
  tokenVersion: { type: Number, default: 1 },

  loginCount: { type: Number, default: 0 },
  lastLoginAt: { type: Date, default: null },
  lastActivityAt: { type: Date, default: null },
})

withCommon(platformAdminSchema, (ret) => {
  ret.fullName = `Administrateur plateforme (${ret.username})`
  return ret
})

export const PlatformAdmin = mongoose.model('PlatformAdmin', platformAdminSchema)
