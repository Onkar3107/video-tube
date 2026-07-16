import './config/env.js'; // Must be first to validate env vars
import { createServer } from 'http';
import { app } from './app.js';
import { prisma } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const httpServer = createServer(app);

async function main() {
  await prisma.$connect();
  logger.info('Database connected');

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
    logger.info(`API Documentation: http://localhost:${env.PORT}/docs`);
  });
}

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  httpServer.close(async () => {
    logger.info('HTTP server closed');
    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (err) {
      logger.error({ err }, 'Error disconnecting database');
    }

    try {
      await disconnectRedis();
    } catch (err) {
      logger.error({ err }, 'Error disconnecting Redis');
    }

    logger.info('All connections closed. Exiting.');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
  process.exit(1);
});

main().catch((err) => {
  logger.fatal({ err }, 'Startup failed');
  process.exit(1);
});
