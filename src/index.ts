import { app } from './app.js';
import { prisma } from './config/database.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function main() {
  await prisma.$connect();
  console.log('PostgreSQL connected via Prisma');

  app.listen(process.env.PORT ?? 8000, () => {
    console.log(`Server is running on port ${process.env.PORT ?? 8000}`);
  });
}

main().catch((err: unknown) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
