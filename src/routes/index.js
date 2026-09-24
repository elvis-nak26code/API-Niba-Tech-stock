import { Router } from 'express'
import authRoutes from './auth.routes.js'
import productRoutes from './products.routes.js'
import categoryRoutes from './categories.routes.js'
import clientRoutes from './clients.routes.js'
import supplierRoutes from './suppliers.routes.js'
import entryRoutes from './entries.routes.js'
import exitRoutes from './exits.routes.js'
import movementRoutes from './movements.routes.js'
import alertRoutes from './alerts.routes.js'
import historyRoutes from './history.routes.js'
import settingRoutes from './settings.routes.js'
import syncRoutes from './sync.routes.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/health', (_req, res) => res.json({ ok: true, name: 'NIBA TECH API', time: new Date().toISOString() }))

router.use('/auth', authRoutes)
router.use('/products', productRoutes)
router.use('/categories', categoryRoutes)
router.use('/clients', clientRoutes)
router.use('/suppliers', supplierRoutes)
router.use('/entries', entryRoutes)
router.use('/exits', exitRoutes)
router.use('/movements', movementRoutes)
router.use('/alerts', alertRoutes)
router.use('/history', historyRoutes)
router.use('/settings', settingRoutes)
router.use('/sync', syncRoutes)

export default router