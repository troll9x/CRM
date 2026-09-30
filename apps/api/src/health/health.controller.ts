import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../identity/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Kiểm tra tiến trình API đang hoạt động' })
  live() {
    return { status: 'ok' as const };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Kiểm tra API kết nối được cơ sở dữ liệu' })
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' as const, database: 'connected' as const };
  }
}
