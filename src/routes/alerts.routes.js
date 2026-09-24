import { Router } from 'express'
import * as alerts from '../controllers/alerts.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', alerts.list)
router.post('/:id/resolve', alerts.resolve)

export default router