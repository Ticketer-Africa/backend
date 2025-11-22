/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('v1/admin')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPERADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get platform stats' })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  @HttpCode(200)
  @ApiOperation({ summary: 'List users' })
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('events')
  @HttpCode(200)
  @ApiOperation({ summary: 'List events' })
  listEvents() {
    return this.adminService.listEvents();
  }

  @Patch('events/:id/toggle')
  @HttpCode(200)
  @ApiOperation({ summary: 'Toggle event active status' })
  toggleEvent(@Param('id') id: string) {
    return this.adminService.toggleEvent(id);
  }

  @Get('transactions')
  @HttpCode(200)
  @ApiOperation({ summary: 'List transactions' })
  listTransactions() {
    return this.adminService.listTransactions();
  }

  @Get('organizers')
  @HttpCode(200)
  @ApiOperation({ summary: 'List organizers' })
  listOrganizers() {
    return this.adminService.listOrganizers();
  }

  @Get('users/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get user details' })
  getUserDetails(@Param('id') id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Get('revenue')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get platform revenue summary' })
  getRevenue() {
    return this.adminService.getPlatformRevenue();
  }

  @Get('revenue/daily')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get daily revenue & tickets sold' })
  getDailyRevenue() {
    return this.adminService.getDailyRevenueAndTickets();
  }
  @Get('events/categories')
  @ApiOperation({ summary: 'Get event categories distribution' })
  getEventCategories() {
    return this.adminService.getEventCategories();
  }
}
