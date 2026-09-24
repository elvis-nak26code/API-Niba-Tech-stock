import { Router } from 'express'
import * as entries from '../controllers/entries.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', entries.list)
router.post('/', entries.create)

export default router