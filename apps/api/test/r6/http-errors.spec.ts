import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  Logger,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { R4ErrorFilter } from '../../src/identity-access/http.js';

afterEach(() => vi.restoreAllMocks());
function host() {
  const response = {
    getHeader: () => '00000000-0000-4000-8000-000000000001',
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return {
    response,
    context: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ get: () => undefined }),
      }),
    } as unknown as ArgumentsHost,
  };
}
describe('R6 sanitized unexpected HTTP failure observability', () => {
  it('logs a correlation for unexpected failures without message, stack, token or SQL values', () => {
    const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined),
      h = host();
    new R4ErrorFilter().catch(
      Error('password=secret OTP=123456 Bearer raw-token SELECT private'),
      h.context,
    );
    expect(log).toHaveBeenCalledTimes(1);
    const encoded = JSON.stringify(log.mock.calls);
    expect(encoded).toContain('00000000-0000-4000-8000-000000000001');
    for (const secret of ['secret', '123456', 'raw-token', 'SELECT private'])
      expect(encoded).not.toContain(secret);
    expect(h.response.status).toHaveBeenCalledWith(500);
  });
  it('keeps ordinary authentication denials out of unexpected-error logs', () => {
    const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined),
      h = host();
    new R4ErrorFilter().catch(new UnauthorizedException(), h.context);
    expect(log).not.toHaveBeenCalled();
    expect(h.response.status).toHaveBeenCalledWith(401);
  });
});
