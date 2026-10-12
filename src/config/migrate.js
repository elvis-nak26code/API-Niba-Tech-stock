// Migration multi-tenant : rattache les documents créés AVANT l'isolation
// (sans champ ownerId) au compte le plus ancien. Exécuté au démarrage de l'API.
// Idempotent : ne s'exécute que sur les documents réellement orphelins.
import bcrypt from 'bcryptjs'
import { env } from './env.js'
import { User } from '../models/User.js'
import { PlatformAdmin } from '../models/PlatformAdmin.js'
import { Product } from '../models/Product.js'
import { Category } from '../models/Category.js'
import { Client } from '../models/Client.js'
import { Supplier } from '../models/Supplier.js'
import { Entry } from '../models/Entry.js'
import { Exit } from '../models/Exit.js'
import { StockMovement } from '../models/StockMovement.js'
import { Setting } from '../models/Setting.js'
import { Alert } from '../models/Alert.js'
import { Activity } from '../models/Activity.js'
import { SyncLog } from '../models/SyncLog.js'
import { Counter } from '../models/Counter.js'

const MODELS = [Product, Category, Client, Supplier, Entry, Exit, StockMovement, Setting, Alert, Activity, SyncLog]

// Les compteurs sont partagés historiquement par toutes les références : on les
// rattache aussi (leurs clés uniques seront recréées par compte au fil de l'eau).
const ORPHAN = { $in: [null, ''] }

export async function migrateOwner() {
  const owner = await User.findOne({}).sort({ createdAt: 1 }).lean()
  if (!owner) {
    console.log('[migrate] Aucun compte : rien à rattacher.')
    return
  }
  const ownerId = owner._id.toString()
  let total = 0
  for (const Model of MODELS) {
    try {
      // orphelins = ownerId absent, null ou vide
      const res = await Model.updateMany(
        { $or: [{ ownerId: ORPHAN }, { ownerId: { $exists: false } }] },
        { $set: { ownerId } },
      )
      if (res.modifiedCount > 0) {
        console.log(`[migrate] ${Model.modelName} : ${res.modifiedCount} document(s) rattaché(s) à ${owner.email || ownerId}`)
        total += res.modifiedCount
      }
    } catch (e) {
      console.error(`[migrate] ${Model.modelName} : échec (${e.message})`)
    }
  }
  if (total > 0) console.log(`[migrate] Total : ${total} document(s) rattaché(s) à « ${owner.email || ownerId} ».`)
  else console.log('[migrate] Aucune donnée orpheline à rattacher.')
}

// Les anciens index uniques (sku, key, reference, name) sont GLOBAUX : ils
// empêcheraient deux comptes distincts d'avoir le même SKU / la même référence.
// On les remplace par les index composés par compte déclarés dans les schémas.
export async function syncTenantIndexes() {
  const all = [Product, Category, Client, Supplier, Entry, Exit, StockMovement, Setting, Alert, Activity, SyncLog, Counter]
  for (const Model of all) {
    try {
      await Model.syncIndexes()
    } catch (e) {
      console.error(`[migrate] Index ${Model.modelName} : échec (${e.message})`)
    }
  }
  console.log('[migrate] Index multi-tenant synchronisés.')
}

// Le nom par défaut du produit est passé de « NIBA TECH » à « GSTOK ». Les
// paramètres déjà provisionnés portent encore l'ancien nom : on ne remplace que
// les valeurs strictement identiques à l'ancien défaut, afin de ne jamais
// écraser un nom de société réellement saisi par l'utilisateur.
export async function migrateCompanyName() {
  try {
    const res = await Setting.updateMany({ name: 'NIBA TECH' }, { $set: { name: 'GSTOK' } })
    if (res.modifiedCount > 0) {
      console.log(`[migrate] Nom de société : ${res.modifiedCount} paramètre(s) passé(s) à « GSTOK ».`)
    }
  } catch (e) {
    console.error(`[migrate] Nom de société : échec (${e.message})`)
  }
}

// Les champs d'apparence (accent, zoom) et le logo ont été ajoutés après les
// premiers comptes. Les documents déjà provisionnés ne portent pas ces clés :
// le poste de bureau les recevrait absents et pourrait écraser une valeur
// locale (notamment le logo) lors d'une synchronisation. On les initialise.
// L'espace Admin est réservé au super administrateur, et le PREMIER compte créé
// le devient. Sur une installation antérieure à cette fonctionnalité, aucun
// compte ne porte encore le drapeau : on promeut le plus ancien, sans quoi
// personne ne pourrait administrer les comptes. Idempotent.
export async function ensureSuperAdmin() {
  try {
    const existing = await User.countDocuments({ isSuperAdmin: true })
    if (existing > 0) return
    const first = await User.findOne({}).sort({ createdAt: 1 })
    if (!first) return
    first.isSuperAdmin = true
    if (first.role !== 'Administrateur') first.role = 'Administrateur'
    await first.save()
    console.log(`[migrate] Super administrateur : « ${first.email} » (premier compte de l'installation).`)
  } catch (e) {
    console.error(`[migrate] Super administrateur : échec (${e.message})`)
  }
}

/**
 * Crée le compte de la plateforme d'administration s'il n'existe pas encore.
 *
 * La plateforme est l'espace de l'exploitant, distinct des comptes de
 * l'application : c'est pourquoi ce compte vit dans sa propre collection et
 * n'apparaît dans aucune liste d'utilisateurs.
 *
 * Idempotent et NON destructif : le compte n'est créé que s'il n'en existe AUCUN.
 * Si l'exploitant a changé son mot de passe, celui-ci est conservé — un simple
 * redémarrage ne doit jamais remettre l'accès par défaut.
 */
export async function ensurePlatformAdmin() {
  try {
    const existing = await PlatformAdmin.countDocuments({})
    if (existing > 0) return

    const username = String(env.platformAdminUsername).trim().toLowerCase()
    const password = String(env.platformAdminPassword)
    await PlatformAdmin.create({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      active: true,
      tokenVersion: 1,
    })
    console.log(`[migrate] Plateforme d'administration : compte « ${username} » créé.`)
    console.log(`[migrate]   → connectez-vous puis changez le mot de passe depuis Réglages.`)
    console.warn(`[migrate]   → mot de passe par défaut en usage (${password.length} caractères). À changer.`)
  } catch (e) {
    console.error(`[migrate] Plateforme d'administration : échec (${e.message})`)
  }
}

export async function backfillSettings() {
  const defaults = { accent: 'green', zoom: 100, logo: '', defaultMinStock: 10, lowStockNotifications: true, negativeStock: false }
  try {
    let total = 0
    for (const [field, value] of Object.entries(defaults)) {
      const res = await Setting.updateMany({ [field]: { $exists: false } }, { $set: { [field]: value } })
      total += res.modifiedCount
    }
    if (total > 0) console.log(`[migrate] Paramètres : ${total} champ(s) initialisé(s).`)
  } catch (e) {
    console.error(`[migrate] Paramètres : échec (${e.message})`)
  }
}
