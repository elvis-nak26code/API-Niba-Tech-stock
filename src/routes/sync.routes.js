import { Router } from 'express'
import * as sync from '../controllers/sync.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/status', sync.status)
router.get('/logs', sync.logs)
router.post('/run', sync.run)
router.post('/full', sync.full)

export default router