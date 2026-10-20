import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { R4Repository } from './identity-access/r4-repository.js';
import { R4Module, configureR4Http } from './identity-access/r4.module.js';
import { required, runtimeConfig } from './identity-access/config.js';
import { PrivateVolumeStorageAdapter } from './file-management/private-volume.adapter.js';

async function bootstrap() {
  const config = runtimeConfig(process.env);
  const repository = new R4Repository(
    required(process.env, 'R4_AUTH_URL'),
    required(process.env, 'R4_API_URL'),
    process.env.R4_WORKER_URL,
  );
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  try {
    await repository.assertRuntime();
    const storage = new PrivateVolumeStorageAdapter(
      required(process.env, 'R5_PRIVATE_STORAGE_ROOT'),
    );
    await storage.initialize();
    app = await NestFactory.create({
      module: AppModule,
      imports: [
        R4Module.register(
          repository,
          config.auth,
          config.delivery,
          config.workerEnabled,
          storage,
        ),
      ],
    });
    configureR4Http(app, config.auth);
    app.enableShutdownHooks();
    const port = Number(process.env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw Error('INVALID_PORT');
    await app.listen(port);
  } catch (error) {
    await app?.close();
    await repository.close();
    throw error;
  }
}
try {
  await bootstrap();
} catch {
  console.error(
    'API_STARTUP_FAILED: verify authentication configuration, restricted database roles and private storage root',
  );
  process.exitCode = 1;
}
