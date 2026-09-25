// Migration multi-tenant : rattache les documents créés AVANT l'isolation
// (sans champ ownerId) au compte le plus ancien. Exécuté au démarrage de l'API.
// Idempotent : ne s'exécute que sur les documents réellement orphelins.
import { User } from '../models/User.js'
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
