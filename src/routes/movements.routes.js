import { Router } from 'express'
import * as movements from '../controllers/movements.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', movements.list)

export default router