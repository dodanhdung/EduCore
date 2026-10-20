import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { bearer, object, uuid } from '../identity-access/http.js';
import { SessionGuard } from '../identity-access/session.guard.js';
import { MAX_FILE_BYTES } from './file-validation.js';
import { FileService } from './file.service.js';
@Controller('api/v1/tenants/:tenantId/files')
@UseGuards(SessionGuard)
export class FileController {
  constructor(@Inject(FileService) private readonly service: FileService) {}
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_FILE_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 100,
        parts: 2,
      },
    }),
  )
  upload(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Body() input: unknown,
    @UploadedFile()
    file:
      { buffer: Buffer; originalname: string; mimetype: string } | undefined,
  ) {
    const b = object(input, ['recipientId']);
    if (!file?.buffer) throw new BadRequestException('FILE_REQUIRED');
    return this.service.upload(
      bearer(a),
      uuid(t),
      uuid(b.recipientId),
      file.originalname,
      file.mimetype,
      file.buffer,
    );
  }
  @Post('reconciliation') reconcile(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Body() input: unknown,
  ) {
    object(input, []);
    return this.service.reconcile(bearer(a), uuid(t));
  }
  @Get(':id') metadata(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.metadata(bearer(a), uuid(t), uuid(id));
  }
  @Get(':id/download') async download(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, bytes } = (await this.service.download(
      bearer(a),
      uuid(t),
      uuid(id),
    )) as Awaited<ReturnType<FileService['download']>>;
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition':
        'attachment; filename="' + file.originalFilename + '"',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Length': String(bytes.length),
    });
    return new StreamableFile(bytes);
  }
}
