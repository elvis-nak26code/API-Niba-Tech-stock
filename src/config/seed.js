import bcrypt from 'bcryptjs'
import { env } from './env.js'
import { User } from '../models/User.js'
import { Category } from '../models/Category.js'
import { Supplier } from '../models/Supplier.js'
import { Client } from '../models/Client.js'
import { Product } from '../models/Product.js'
import { Setting } from '../models/Setting.js'

const CATEGORIES = [
  { id: 'c-alim', name: 'Alimentaire', description: 'Produits alimentaires' },
  { id: 'c-bois', name: 'Boissons', description: 'Eaux, jus et boissons' },
  { id: 'c-cons', name: 'Construction', description: 'Matériaux de construction' },
  { id: 'c-elec', name: 'Électricité', description: 'Matériel électrique' },
  { id: 'c-hyg', name: 'Hygiène', description: "Produits d'hygiène" },
  { id: 'c-pap', name: 'Papeterie', description: 'Fournitures de bureau' },
  { id: 'c-sec', name: 'Sécurité', description: 'Équipements de protection' },
]

const SETTINGS = {
  key: 'default',
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
  { id: 's-welcome', name: 'Welcome Market', contactName: 'Alassane', phone: '+223 70 00 00 01', email: 'contact@welcome-market.ml' },
  { id: 's-afritrade', name: 'Afritrade', contactName: 'Moussa', phone: '+223 70 00 00 02', email: 'infos@afritrade.ml' },
  { id: 's-ecobat', name: 'Ecobat Plus', contactName: 'Ibrahima', phone: '+223 70 00 00 03', email: 'ventes@ecobat.ml' },
]

const DEMO_CLIENTS = [
  { id: 'cl-toure', firstName: 'Fatoumata', lastName: 'Touré', phone: '+223 76 11 22 33', email: 'ftoure@mail.com', address: 'Badalabougou, Bamako' },
  { id: 'cl-kone', firstName: 'Youssouf', lastName: 'Koné', phone: '+223 90 44 55 66', email: 'ykone@mail.com', address: 'Hamdallaye, Bamako' },
  { id: 'cl-dembele', firstName: 'Aminata', lastName: 'Dembélé', phone: '+223 65 77 88 99', email: 'adembele@mail.com', address: 'ACI 2000, Bamako' },
]

const DEMO_PRODUCTS = [
  { id: 'p-rice', name: 'Riz parfumé 25kg', sku: 'ALIM-RIZ-25', categoryId: 'c-alim', supplierId: 's-welcome', purchasePrice: 17500, sellPrice: 19500, minStock: 10, quantity: 40 },
  { id: 'p-huile', name: 'Huile végétale 1L', sku: 'ALIM-HUIL-1', categoryId: 'c-alim', supplierId: 's-afritrade', purchasePrice: 850, sellPrice: 1000, minStock: 24, quantity: 90 },
  { id: 'p-succ', name: 'Sucre en poudre 1kg', sku: 'ALIM-SUCR-1', categoryId: 'c-alim', supplierId: 's-welcome', purchasePrice: 725, sellPrice: 850, minStock: 20, quantity: 60 },
  { id: 'p-eau', name: 'Eau minérale 1,5L', sku: 'BOIS-EAU-15', categoryId: 'c-bois', supplierId: 's-afritrade', purchasePrice: 350, sellPrice: 500, minStock: 24, quantity: 8 },
  { id: 'p-juice', name: 'Jus de fruits 1L', sku: 'BOIS-JUS-1', categoryId: 'c-bois', supplierId: 's-afritrade', purchasePrice: 900, sellPrice: 1200, minStock: 12, quantity: 30 },
  { id: 'p-bidon', name: 'Bidon d’eau 12L', sku: 'BOIS-BID-12', categoryId: 'c-bois', supplierId: 's-welcome', purchasePrice: 950, sellPrice: 1100, minStock: 10, quantity: 25 },
  { id: 'p-sable', name: 'Sachet de ciment 50kg', sku: 'CONS-CIM-50', categoryId: 'c-cons', supplierId: 's-ecobat', purchasePrice: 7500, sellPrice: 8000, minStock: 20, quantity: 1 },
  { id: 'p-fer', name: 'Barre de fer 12mm', sku: 'CONS-FER-12', categoryId: 'c-cons', supplierId: 's-ecobat', purchasePrice: 4500, sellPrice: 5000, minStock: 30, quantity: 55 },
  { id: 'p-cable', name: 'Câble électrique 2,5mm', sku: 'ELEC-CAB-25', categoryId: 'c-elec', supplierId: 's-ecobat', purchasePrice: 1500, sellPrice: 1800, minStock: 50, quantity: 120 },
  { id: 'p-lampe', name: 'Ampoule LED 9W', sku: 'ELEC-LED-9', categoryId: 'c-elec', supplierId: 's-ecobat', purchasePrice: 700, sellPrice: 900, minStock: 30, quantity: 45 },
  { id: 'p-carton', name: 'Carton A4 80g', sku: 'PAP-CAR-A4', categoryId: 'c-pap', supplierId: 's-afritrade', purchasePrice: 3500, sellPrice: 4000, minStock: 10, quantity: 20 },
  { id: 'p-stylo', name: 'Stylo à bille bleu', sku: 'PAP-STY-B', categoryId: 'c-pap', supplierId: 's-afritrade', purchasePrice: 100, sellPrice: 150, minStock: 100, quantity: 250 },
  { id: 'p-gant', name: 'Gants de protection', sku: 'SEC-GAN-P', categoryId: 'c-sec', supplierId: 's-welcome', purchasePrice: 600, sellPrice: 800, minStock: 20, quantity: 35 },
  { id: 'p-casq', name: 'Casque de chantier', sku: 'SEC-CAS-C', categoryId: 'c-sec', supplierId: 's-welcome', purchasePrice: 1800, sellPrice: 2200, minStock: 10, quantity: 0 },
  { id: 'p-savon', name: 'Savon de ménage', sku: 'HYG-SAV-M', categoryId: 'c-hyg', supplierId: 's-afritrade', purchasePrice: 250, sellPrice: 350, minStock: 30, quantity: 75 },
  { id: 'p-bleach', name: 'Eau de Javel 1L', sku: 'HYG-JAV-1', categoryId: 'c-hyg', supplierId: 's-afritrade', purchasePrice: 450, sellPrice: 600, minStock: 12, quantity: 4 },
]

export async function ensureSeedData() {
  const catCount = await Category.countDocuments()
  if (catCount === 0) {
    await Category.insertMany(CATEGORIES.map(({ id, ...rest }) => ({ _id: id, ...rest })))
    console.log('[seed] Catégories initialisées')
  }

  const settingCount = await Setting.countDocuments({ key: 'default' })
  if (settingCount === 0) {
    await Setting.create(SETTINGS)
    console.log('[seed] Paramètres NIBA TECH initialisés')
  }

  const adminCount = await User.countDocuments({ role: 'Administrateur' })
  if (adminCount === 0) {
    await User.create({
      firstName: 'Admin',
      lastName: 'NIBA',
      email: env.defaultAdminEmail,
      phone: '+223 93 74 96 34',
      passwordHash: await bcrypt.hash(env.defaultAdminPassword, 10),
      role: 'Administrateur',
      active: true,
    })
    console.log('[seed] Compte administrateur créé :', env.defaultAdminEmail)
  }

  if (env.seedDemo) {
    const supplierCount = await Supplier.countDocuments()
    if (supplierCount === 0) {
      await Supplier.insertMany(DEMO_SUPPLIERS.map(({ id, ...rest }) => ({ _id: id, ...rest })))
      console.log('[seed] Fournisseurs de démonstration initialisés')
    }
    const clientCount = await Client.countDocuments()
    if (clientCount === 0) {
      await Client.insertMany(DEMO_CLIENTS.map(({ id, ...rest }) => ({ _id: id, ...rest })))
      console.log('[seed] Clients de démonstration initialisés')
    }
    const productCount = await Product.countDocuments()
    if (productCount === 0) {
      const catName = new Map(CATEGORIES.map((c) => [c.id, c.name]))
      const supName = new Map(DEMO_SUPPLIERS.map((s) => [s.id, s.name]))
      await Product.insertMany(
        DEMO_PRODUCTS.map(({ id, categoryId, supplierId, ...rest }) => ({
          _id: id,
          categoryId,
          supplierId,
          category: catName.get(categoryId) || '—',
          supplier: supName.get(supplierId) || '—',
          ...rest,
          unit: 'pièce',
          description: '',
          isDeleted: false,
        })),
      )
      console.log('[seed] Produits de démonstration initialisés')
    }
  }
}