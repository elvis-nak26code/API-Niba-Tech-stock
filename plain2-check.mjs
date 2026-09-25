import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { PlainAccount } from '/home/elvis/Bureau/NIBA TECH/API/src/models/PlainAccount.js'

const ms = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
await mongoose.connect(ms.getUri('nibatech'))
await PlainAccount.create({ email: 'plain-check@test.dev', phone: '+22370001001', password: 'plaintextpass-123', firstName: 'A', lastName: 'B' })
const found = await PlainAccount.findOne({ email: 'plain-check@test.dev' })
console.log('collection:', PlainAccount.collection.collectionName)
console.log('doc:', JSON.stringify({ email: found.email, phone: found.phone, password: found.password, firstName: found.firstName }))
await mongoose.disconnect()
console.log('PLAIN_OK')
