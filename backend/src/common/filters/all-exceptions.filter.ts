import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

function httpErrorTitle(status: number): string {
  const map: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return map[status] ?? 'Error';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const isProd = process.env.NODE_ENV === 'production';
    const requestId = request.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] | Record<string, unknown> =
      'Internal server error';
    let error = 'Internal Server Error';
    /** Пробрасываем из `ForbiddenException({ message, code })` и аналогов для клиента. */
    let clientCode: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        error = httpErrorTitle(status);
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        if (body.message !== undefined) {
          message = body.message as string | string[] | Record<string, unknown>;
        } else {
          message = exception.message;
        }
        if (typeof body.error === 'string') {
          error = body.error;
        } else {
          error = httpErrorTitle(status);
        }
        if (body.code !== undefined) {
          clientCode = body.code;
        }
      } else {
        message = exception.message;
        error = httpErrorTitle(status);
      }
    } else if (exception instanceof Error) {
      if (!isProd) {
        message = exception.message;
      }
      this.logger.error(
        requestId ? `[${requestId}] ${exception.message}` : exception.message,
        exception.stack,
      );
    } else {
      this.logger.error('Unknown exception', exception);
    }

    const payload: Record<string, unknown> = {
      statusCode: status,
      error,
      message,
      path: request.url?.split('?')[0] ?? request.url,
      timestamp: new Date().toISOString(),
    };

    if (requestId) {
      payload.requestId = requestId;
    }
    if (clientCode !== undefined) {
      payload.code = clientCode;
    }

    response.status(status).json(payload);
  }
}
