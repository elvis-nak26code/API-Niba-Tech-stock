import { Router } from 'express'
import * as history from '../controllers/history.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', history.list)

export default router