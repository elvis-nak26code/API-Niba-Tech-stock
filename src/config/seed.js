// Provisionnement PAR COMPTE : chaque inscription crée les paramètres et les
// catégories de base de CE compte uniquement. Plus aucune donnée partagée :
// un compte ne voit jamais les données d'un autre.
import { env } from './env.js'
import { User } from '../models/User.js'
import { Category } from '../models/Category.js'
import { Supplier } from '../models/Supplier.js'
import { Client } from '../models/Client.js'
import { Product } from '../models/Product.js'
import { Setting } from '../models/Setting.js'

const CATEGORIES = [
  { name: 'Alimentaire', description: 'Produits alimentaires' },
  { name: 'Boissons', description: 'Eaux, jus et boissons' },
  { name: 'Construction', description: 'Matériaux de construction' },
  { name: 'Électricité', description: 'Matériel électrique' },
  { name: 'Hygiène', description: "Produits d'hygiène" },
  { name: 'Papeterie', description: 'Fournitures de bureau' },
  { name: 'Sécurité', description: 'Équipements de protection' },
]

const SETTINGS = {
  name: 'NIBA TECH',
  tagline: 'Votre partenaire de distribution',
  phone: '+223 93 74 96 34',
  phone2: '+226 64 74 73 80',
  email: 'contact@nibatech.com',
  address: 'Bamako, Mali',
  currency: 'XOF',
  receiptPrefix: 'REC',
  receiptFooter: 'Merci de votre visite !',
  receiptNote: 'Les produits vendus ou échangés ne sont ni repris ni remboursés.',
  lowStockNotifications: true,
  negativeStock: false,
  defaultMinStock: 10,
}

const DEMO_SUPPLIERS = [
  { name: 'Welcome Market', contactName: 'Alassane', phone: '+223 70 00 00 01', email: 'contact@welcome-market.ml' },
  { name: 'Afritrade', contactName: 'Moussa', phone: '+223 70 00 00 02', email: 'infos@afritrade.ml' },
  { name: 'Ecobat Plus', contactName: 'Ibrahima', phone: '+223 70 00 00 03', email: 'ventes@ecobat.ml' },
]

const DEMO_CLIENTS = [
  { firstName: 'Fatoumata', lastName: 'Touré', phone: '+223 76 11 22 33', email: 'ftoure@mail.com', address: 'Badalabougou, Bamako' },
  { firstName: 'Youssouf', lastName: 'Koné', phone: '+223 90 44 55 66', email: 'ykone@mail.com', address: 'Hamdallaye, Bamako' },
  { firstName: 'Aminata', lastName: 'Dembélé', phone: '+223 65 77 88 99', email: 'adembele@mail.com', address: 'ACI 2000, Bamako' },
]

const DEMO_PRODUCTS = [
  { name: 'Riz parfumé 25kg', sku: 'ALIM-RIZ-25', category: 'Alimentaire', supplier: 'Welcome Market', purchasePrice: 17500, sellPrice: 19500, minStock: 10, quantity: 40 },
  { name: 'Huile végétale 1L', sku: 'ALIM-HUIL-1', category: 'Alimentaire', supplier: 'Afritrade', purchasePrice: 850, sellPrice: 1000, minStock: 24, quantity: 90 },
  { name: 'Sucre en poudre 1kg', sku: 'ALIM-SUCR-1', category: 'Alimentaire', supplier: 'Welcome Market', purchasePrice: 725, sellPrice: 850, minStock: 20, quantity: 60 },
  { name: 'Eau minérale 1,5L', sku: 'BOIS-EAU-15', category: 'Boissons', supplier: 'Afritrade', purchasePrice: 350, sellPrice: 500, minStock: 24, quantity: 8 },
  { name: 'Ciment 50kg', sku: 'CONS-CIM-50', category: 'Construction', supplier: 'Ecobat Plus', purchasePrice: 7500, sellPrice: 8000, minStock: 20, quantity: 1 },
  { name: 'Barre de fer 12mm', sku: 'CONS-FER-12', category: 'Construction', supplier: 'Ecobat Plus', purchasePrice: 4500, sellPrice: 5000, minStock: 30, quantity: 55 },
  { name: 'Câble électrique 2,5mm', sku: 'ELEC-CAB-25', category: 'Électricité', supplier: 'Ecobat Plus', purchasePrice: 1500, sellPrice: 1800, minStock: 50, quantity: 120 },
  { name: 'Ampoule LED 9W', sku: 'ELEC-LED-9', category: 'Électricité', supplier: 'Ecobat Plus', purchasePrice: 700, sellPrice: 900, minStock: 30, quantity: 45 },
  { name: 'Carton A4 80g', sku: 'PAP-CAR-A4', category: 'Papeterie', supplier: 'Afritrade', purchasePrice: 3500, sellPrice: 4000, minStock: 10, quantity: 20 },
  { name: 'Savon de ménage', sku: 'HYG-SAV-M', category: 'Hygiène', supplier: 'Afritrade', purchasePrice: 250, sellPrice: 350, minStock: 30, quantity: 75 },
  { name: 'Casque de chantier', sku: 'SEC-CAS-C', category: 'Sécurité', supplier: 'Welcome Market', purchasePrice: 1800, sellPrice: 2200, minStock: 10, quantity: 0 },
  { name: 'Gants de protection', sku: 'SEC-GAN-P', category: 'Sécurité', supplier: 'Welcome Market', purchasePrice: 600, sellPrice: 800, minStock: 20, quantity: 35 },
]

// Crée (une seule fois) le jeu de données de base d'un compte. Idempotent.
export async function provisionTenant(ownerId) {
  const owner = String(ownerId)
  if (await Setting.findOne({ ownerId: owner, key: 'default' }).lean()) return

  await Setting.create({ ...SETTINGS, key: 'default', ownerId: owner })
  const cats = await Category.insertMany(
    CATEGORIES.map((c) => ({ ...c, ownerId: owner })),
  )
  const catName = new Map(cats.map((c) => [c.name, c._id.toString()]))

  if (env.seedDemo) {
    const suppliers = await Supplier.insertMany(DEMO_SUPPLIERS.map((s) => ({ ...s, ownerId: owner })))
    await Client.insertMany(DEMO_CLIENTS.map((c) => ({ ...c, ownerId: owner })))
    const supName = new Map(suppliers.map((s) => [s.name, s._id.toString()]))
    await Product.insertMany(
      DEMO_PRODUCTS.map(({ category, supplier, ...rest }) => ({
        ...rest,
        category,
        supplier,
        categoryId: catName.get(category) || null,
        supplierId: supName.get(supplier) || null,
        ownerId: owner,
        unit: 'pièce',
        description: '',
        isDeleted: false,
      })),
    )
  }
  console.log(`[seed] Compte provisionné (${owner})`)
}

// Aucun compte particulier n'est créé au démarrage : chaque utilisateur
// s'inscrit lui-même et reçoit son propre espace de données privé.
// (Cette fonction est conservée comme point d'extension : elle ne crée rien.)
export async function ensureSeedData() {
  const count = await User.countDocuments({})
  if (count === 0) {
    console.log('[seed] Aucune donnée existante : le premier compte pourra créer son espace au moment de l\'inscription.')
  }
}
