import 'dotenv/config'

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nibatech',
  mongoVersion: process.env.MONGODB_VERSION || '7.0.14',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  // Identifiants par défaut de la plateforme d'administration. Ils ne servent
  // qu'à créer le compte AU PREMIER DÉMARRAGE ; ensuite seul le mot de passe
  // changé depuis l'interface compte. Voir `ensurePlatformAdmin` (migrate.js).
  platformAdminUsername: process.env.PLATFORM_ADMIN_USERNAME || 'admin',
  platformAdminPassword: process.env.PLATFORM_ADMIN_PASSWORD || 'admin1234',
  seedDemo: process.env.SEED_DEMO === 'true',
  // Une session sans heartbeat depuis plus de ce délai est « hors ligne ».
  offlineAfterMs: Number(process.env.OFFLINE_AFTER_MS || 90 * 1000),
  // Balayage des blocages expirés (défense secondaire : le statut est déjà
  // recalculé à la volée, ce balayage nettoie les données persistées).
  blockSweepMs: Number(process.env.BLOCK_SWEEP_MS || 60 * 1000),
  auditPageSize: Number(process.env.AUDIT_PAGE_SIZE || 25),
}