import { HttpException } from '@nestjs/common';

export interface ProblemDetail {
  field?: string;
  reason: string;
}

export class ProblemException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: ProblemDetail[],
    readonly retryable = false,
  ) {
    super(message, status);
  }
}
