import { Router } from 'express'
import * as exits from '../controllers/exits.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', exits.list)
router.post('/', exits.create)

export default router