import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` không cần DB. Migration/seed vẫn thất bại an toàn nếu
    // DATABASE_URL thật chưa được cấu hình vì URL dự phòng không tồn tại.
    url: process.env.DATABASE_URL ?? 'postgresql://not-used:not-used@127.0.0.1:59999/not-used',
  },
});
