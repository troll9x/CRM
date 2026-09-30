import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { createApplication } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT') ?? 4000;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
