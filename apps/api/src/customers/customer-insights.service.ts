import { Injectable } from '@nestjs/common';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';
import { PERMISSIONS } from '../identity/permissions';
import { PrismaService } from '../prisma/prisma.service';

const PROMPT_VERSION = 'customer-insights-01';
const MODEL = 'qwen3:1.7b';

@Injectable()
export class CustomerInsightsService {
  private readonly inFlight = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async analyze(customerId: string, actor: RequestStaff, requestId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId: actor.businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!customer)
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
    if (!actor.permissions.includes(PERMISSIONS.ORDERS_READ)) {
      throw new ProblemException(403, 'FORBIDDEN', 'Cần quyền xem đơn hàng để phân tích.');
    }

    const recentRun = await this.prisma.auditLog.findFirst({
      where: {
        businessId: actor.businessId,
        actorId: actor.id,
        action: 'customer.ai_insight',
        entityType: 'Customer',
        entityId: customerId,
        createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
      },
      select: { id: true },
    });
    if (recentRun)
      throw new ProblemException(
        429,
        'AI_RATE_LIMIT',
        'Vui lòng đợi 5 phút trước khi phân tích lại.',
      );

    const key = `${actor.businessId}:${customerId}`;
    if (this.inFlight.size > 0) {
      throw new ProblemException(
        429,
        'AI_RUN_IN_PROGRESS',
        'Model đang xử lý một yêu cầu khác. Vui lòng thử lại sau.',
      );
    }
    this.inFlight.add(key);
    try {
      const where = {
        businessId: actor.businessId,
        status: 'DELIVERED' as const,
        deliveredAt: { not: null },
        order: { businessId: actor.businessId, customerId, status: 'CONFIRMED' as const },
      };
      const [aggregate, shipments] = await this.prisma.$transaction(
        [
          this.prisma.shipment.aggregate({
            where,
            _count: { id: true },
            _sum: { recognizedRevenueVnd: true },
            _max: { deliveredAt: true },
          }),
          this.prisma.shipment.findMany({
            where,
            orderBy: { deliveredAt: 'desc' },
            take: 3,
            select: { orderId: true, deliveredAt: true, recognizedRevenueVnd: true },
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      const analyzedAt = new Date().toISOString();
      if (aggregate._count.id === 0) {
        return {
          status: 'INSUFFICIENT_DATA',
          analyzedAt,
          scope: 'Đơn đã xác nhận và giao đủ',
          reason: 'Chưa có đơn đã giao để phân tích hành vi mua.',
        };
      }
      const evidence = shipments.map((shipment) => ({
        type: 'DELIVERED_ORDER' as const,
        id: shipment.orderId,
        deliveredAt: shipment.deliveredAt!.toISOString(),
        recognizedRevenueVnd: shipment.recognizedRevenueVnd.toFixed(0),
      }));
      const facts = {
        deliveredOrderCount: aggregate._count.id,
        recognizedRevenueVnd: aggregate._sum.recognizedRevenueVnd?.toFixed(0) ?? '0',
        latestDeliveredAt: aggregate._max.deliveredAt!.toISOString(),
        evidenceScope: '3 đơn giao gần nhất; chỉ số tổng tính trên toàn bộ đơn đã giao',
        evidence,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      let raw: unknown;
      try {
        const response = await fetch('http://ollama:11434/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: MODEL,
            think: false,
            stream: false,
            keep_alive: 0,
            format: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                suggestion: { type: 'string' },
                evidenceIds: { type: 'array', items: { type: 'string' } },
              },
              required: ['summary', 'suggestion', 'evidenceIds'],
            },
            prompt: [
              '/no_think Bạn là trợ lý CRM chỉ đưa ra gợi ý, viết tiếng Việt ngắn gọn.',
              'Chỉ dùng JSON dữ kiện dưới đây. Không suy đoán ý định mua, giá, tồn kho, công nợ hay thông tin cá nhân.',
              'Không thực hiện hành động. Nếu ít dữ kiện, nói rõ độ thiếu dữ liệu.',
              'Mỗi nhận định phải gắn ít nhất một evidenceIds có trong dữ kiện.',
              JSON.stringify(facts),
            ].join('\n'),
            options: { temperature: 0, num_predict: 130, num_ctx: 2048 },
          }),
        });
        if (!response.ok) throw new Error(`LOCAL_MODEL_HTTP_${response.status}`);
        raw = await response.json();
      } catch {
        throw new ProblemException(
          503,
          'LOCAL_AI_UNAVAILABLE',
          'Model AI trên VPS chưa sẵn sàng.',
          undefined,
          true,
        );
      } finally {
        clearTimeout(timeout);
      }

      let output: unknown;
      try {
        output = JSON.parse((raw as { response: string }).response);
      } catch {
        throw new ProblemException(502, 'AI_INVALID_OUTPUT', 'Model trả về dữ liệu không hợp lệ.');
      }
      if (!output || typeof output !== 'object' || Array.isArray(output)) {
        throw new ProblemException(502, 'AI_INVALID_OUTPUT', 'Model trả về dữ liệu không hợp lệ.');
      }
      const result = output as { summary?: unknown; suggestion?: unknown; evidenceIds?: unknown };
      const allowedIds = new Set(evidence.map((item) => item.id));
      if (
        typeof result.summary !== 'string' ||
        result.summary.trim().length < 1 ||
        result.summary.length > 600 ||
        typeof result.suggestion !== 'string' ||
        result.suggestion.trim().length < 1 ||
        result.suggestion.length > 600 ||
        !Array.isArray(result.evidenceIds) ||
        result.evidenceIds.length < 1 ||
        result.evidenceIds.length > 10 ||
        !result.evidenceIds.every((id) => typeof id === 'string' && allowedIds.has(id))
      ) {
        throw new ProblemException(
          502,
          'AI_INVALID_OUTPUT',
          'Model chưa cung cấp chứng cứ hợp lệ.',
        );
      }
      const [currentActor, currentCustomer] = await Promise.all([
        this.prisma.staffUser.findFirst({
          where: { id: actor.id, businessId: actor.businessId, status: 'ACTIVE' },
          select: {
            roles: {
              select: { role: { select: { permissions: { select: { permissionKey: true } } } } },
            },
          },
        }),
        this.prisma.customer.findFirst({
          where: { id: customerId, businessId: actor.businessId, status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);
      if (!currentCustomer) {
        throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
      }
      const currentPermissions = new Set(
        currentActor?.roles.flatMap((item) => item.role.permissions.map((p) => p.permissionKey)),
      );
      if (
        !currentActor ||
        !currentPermissions.has(PERMISSIONS.CUSTOMERS_READ) ||
        !currentPermissions.has(PERMISSIONS.ORDERS_READ)
      ) {
        throw new ProblemException(403, 'PERMISSION_DENIED', 'Quyền xem dữ liệu đã thay đổi.');
      }
      const safeResult = {
        summary: result.summary,
        suggestion: result.suggestion,
        evidenceIds: result.evidenceIds as string[],
      };
      const run = await this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.ai_insight',
          entityType: 'Customer',
          entityId: customerId,
          requestId,
          metadata: { promptVersion: PROMPT_VERSION, model: MODEL, facts, result: safeResult },
        },
        select: { id: true },
      });
      return {
        status: 'READY',
        runId: run.id,
        analyzedAt,
        scope: 'Đơn đã xác nhận và giao đủ',
        promptVersion: PROMPT_VERSION,
        model: MODEL,
        facts,
        result: safeResult,
        notice: 'Đây là gợi ý AI; nhân viên cần đối chiếu chứng từ trước khi hành động.',
      };
    } finally {
      this.inFlight.delete(key);
    }
  }

  async feedback(
    customerId: string,
    runId: string,
    useful: unknown,
    actor: RequestStaff,
    requestId: string,
  ) {
    if (typeof useful !== 'boolean') {
      throw new ProblemException(400, 'INVALID_FEEDBACK', 'Phản hồi phải là đúng hoặc sai.');
    }
    const run = await this.prisma.auditLog.findFirst({
      where: {
        id: runId,
        businessId: actor.businessId,
        entityType: 'Customer',
        entityId: customerId,
        action: 'customer.ai_insight',
      },
      select: { id: true },
    });
    if (!run)
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy lần phân tích.');
    const prior = await this.prisma.auditLog.findFirst({
      where: {
        businessId: actor.businessId,
        actorId: actor.id,
        action: 'customer.ai_feedback',
        entityId: runId,
      },
      select: { id: true },
    });
    if (prior)
      throw new ProblemException(409, 'FEEDBACK_EXISTS', 'Bạn đã phản hồi lần phân tích này.');
    await this.prisma.auditLog.create({
      data: {
        businessId: actor.businessId,
        actorId: actor.id,
        action: 'customer.ai_feedback',
        entityType: 'AiRun',
        entityId: runId,
        requestId,
        metadata: { customerId, useful },
      },
    });
    return { saved: true };
  }
}
