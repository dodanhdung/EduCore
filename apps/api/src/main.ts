import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { R4Repository } from './identity-access/r4-repository.js';
import { R4Module, configureR4Http } from './identity-access/r4.module.js';
import { required, runtimeConfig } from './identity-access/config.js';

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
    app = await NestFactory.create({
      module: AppModule,
      imports: [
        R4Module.register(
          repository,
          config.auth,
          config.delivery,
          config.workerEnabled,
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
    'R4_STARTUP_FAILED: verify required configuration and restricted database roles',
  );
  process.exitCode = 1;
}
