import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import type { ApiErrorResponse } from "@iot-ai-platform/shared-types";

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
};

/** Maps every thrown error to the standard ApiErrorResponse envelope (see docs/ARCHITECTURE.md §5). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string"
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);

      const payload: ApiErrorResponse = {
        success: false,
        error: {
          code: STATUS_CODES[status] ?? "ERROR",
          message: Array.isArray(message) ? message.join(", ") : message,
          details: typeof body === "object" ? body : undefined,
        },
      };

      response.status(status).json(payload);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);

    const payload: ApiErrorResponse = {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
  }
}
