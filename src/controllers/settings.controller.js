import { Setting } from '../models/Setting.js'
import { NotFound } from '../middleware/error.js'
import { catchAsync, ok } from '../utils/res.js'

// Les paramètres appartiennent au compte : un document par ownerId.
export async function getSettings(ownerId) {
  let s = await Setting.findOne({ ownerId, key: 'default' })
  if (!s) {
    s = await Setting.create({ key: 'default', ownerId })
  }
  return s.toObject()
}

export const get = catchAsync(async (req, res) => {
  ok(res, await getSettings(req.user.id))
})

export const update = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  let s = await Setting.findOne({ ownerId, key: 'default' })
  if (!s) s = await Setting.create({ key: 'default', ownerId })
  const { ownerId: _ignored, key: _key, ...fields } = req.body
  Object.assign(s, fields)
  await s.save()
  ok(res, s.toObject())
})
