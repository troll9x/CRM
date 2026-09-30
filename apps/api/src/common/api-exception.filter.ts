import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ProblemException, type ProblemDetail } from './problem.exception';
import type { RequestWithContext } from './request-context';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();

    let status: number = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Đã xảy ra lỗi phía máy chủ.';
    let details: ProblemDetail[] | undefined;
    let retryable = true;

    if (exception instanceof ProblemException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
      retryable = exception.retryable;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      retryable = status >= 500;
      if (status === 400) {
        code = 'VALIDATION_ERROR';
        message = 'Dữ liệu gửi lên không hợp lệ.';
        const messages =
          typeof payload === 'object' && payload && 'message' in payload
            ? (payload as { message?: string | string[] }).message
            : undefined;
        details = (Array.isArray(messages) ? messages : messages ? [messages] : []).map(
          (reason) => ({
            reason,
          }),
        );
      } else if (status === 401) {
        code = 'AUTHENTICATION_REQUIRED';
        message = 'Vui lòng đăng nhập để tiếp tục.';
      } else if (status === 403) {
        code = 'PERMISSION_DENIED';
        message = 'Bạn không có quyền thực hiện thao tác này.';
      } else if (status === 404) {
        code = 'RESOURCE_NOT_FOUND';
        message = 'Không tìm thấy dữ liệu yêu cầu.';
      } else {
        message = exception.message;
        code = `HTTP_${status}`;
      }
    }

    if (status >= 500) {
      // Chỉ log thông tin chẩn đoán phía server; response không lộ stack hay SQL.
      console.error(`[${request.requestId}]`, exception);
    }

    response.status(status).json({
      error: { code, message, ...(details?.length ? { details } : {}), retryable },
      meta: { requestId: request.requestId },
    });
  }
}
