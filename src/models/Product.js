import mongoose from 'mongoose'
import { withCommon } from './base.js'

const productSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  name: { type: String, required: true, trim: true },
  sku: { type: String, unique: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'Divers' },
  categoryId: { type: String, default: null },
  supplier: { type: String, default: '—' },
  supplierId: { type: String, default: null },
  purchasePrice: { type: Number, default: 0 },
  sellPrice: { type: Number, default: 0 },
  minStock: { type: Number, default: 10 },
  quantity: { type: Number, default: 0 },
  unit: { type: String, default: 'pièce' },
  image: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
})

productSchema.index({ name: 1 })
productSchema.index({ categoryId: 1 })
productSchema.index({ supplierId: 1 })
productSchema.index({ isDeleted: 1 })
withCommon(productSchema)

export const Product = mongoose.model('Product', productSchema)