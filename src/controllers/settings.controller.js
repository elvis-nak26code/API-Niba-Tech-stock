import { Setting } from '../models/Setting.js'
import { NotFound } from '../middleware/error.js'
import { catchAsync, ok } from '../utils/res.js'

export async function getSettings() {
  let s = await Setting.findOne({ key: 'default' })
  if (!s) {
    s = await Setting.create({ key: 'default' })
  }
  return s.toObject()
}

export const get = catchAsync(async (_req, res) => {
  ok(res, await getSettings())
})

export const update = catchAsync(async (req, res) => {
  let s = await Setting.findOne({ key: 'default' })
  if (!s) s = await Setting.create({ key: 'default' })
  Object.assign(s, req.body)
  await s.save()
  ok(res, s.toObject())
})