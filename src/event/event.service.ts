/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import slugify from 'slugify';
import { Prisma } from '@prisma/client';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  // Private Helpers
  private sanitizeForCacheTag(value: string): string {
    return value.replace(/[^a-zA-Z0-9]/g, '_');
  }

  private async findEventById(eventId: string) {
    const sanitizedEventId = this.sanitizeForCacheTag(eventId);
    // Caching event lookup by ID
    // - TTL: 5 minutes to reduce DB load for frequent event checks in ticket purchase flow
    // - SWR: 1 minute to serve cached data quickly while refreshing for near-real-time updates
    // - Tags: `event_${sanitizedEventId}` for granular invalidation, `events` for list invalidation
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        organizerId: true,
        location: true,
        date: true,
        category: true,
        isActive: true,
        bannerUrl: true,
        ticketCategories: true,
      },
      cacheStrategy: {
        ttl: 300, // 5 minutes
        swr: 60, // 1 minute
        tags: [`event_${sanitizedEventId}`, 'events'],
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async findEventBySlug(slug: string) {
    const sanitizedSlug = this.sanitizeForCacheTag(slug);
    const event = await this.prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        organizerId: true,
        location: true,
        date: true,
        category: true,
        isActive: true,
        bannerUrl: true,
        ticketCategories: true,
        organizer: { select: { name: true, email: true, profileImage: true } },
      },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`event_${sanitizedSlug}`, 'events'],
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private validateOwnership(event: any, userId: string) {
    if (event.organizerId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async uploadBannerIfProvided(
    file?: Express.Multer.File,
  ): Promise<string | undefined> {
    if (!file) return undefined;
    this.logger.log(`Uploading file: ${file.originalname}`);
    try {
      const upload = await this.cloudinary.uploadImage(file, 'ticketer/events');
      this.logger.log(`Image uploaded successfully: ${upload}`);
      return upload;
    } catch (err) {
      this.logger.error(`Image upload failed: ${err.message}`);
      throw new InternalServerErrorException('Failed to upload event banner');
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    const exists = await this.prisma.event.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (exists) {
      slug = `${baseSlug}-${Date.now().toString().slice(-5)}`;
    }
    return slug;
  }

  private async deleteBannerIfExists(bannerUrl?: string) {
    if (!bannerUrl) return;
    try {
      await this.cloudinary.deleteImage(bannerUrl);
    } catch (err) {
      this.logger.warn(
        `Failed to delete banner from Cloudinary: ${err.message}`,
      );
    }
  }

  private async checkIfTicketsExist(eventId: string): Promise<void> {
    const sanitizedEventId = this.sanitizeForCacheTag(eventId);
    const ticketsCount = await this.prisma.ticket.count({
      where: { eventId },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`event_tickets_${sanitizedEventId}`],
      },
    });
    if (ticketsCount > 0) {
      throw new BadRequestException(
        'Event cannot be deleted because tickets have already been purchased',
      );
    }
  }

  private async invalidateEventCache(eventId: string, slug?: string) {
    const sanitizedEventId = this.sanitizeForCacheTag(eventId);
    const tags = [`event_${sanitizedEventId}`, 'events'];
    if (slug) {
      const sanitizedSlug = this.sanitizeForCacheTag(slug);
      tags.push(`event_${sanitizedSlug}`);
    }
    this.logger.debug(`Invalidating cache tags: ${JSON.stringify(tags)}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P6003'
      ) {
        this.logger.error('Cache invalidation rate limit reached:', e.message);
      } else {
        throw e;
      }
    }
  }

  // Creation and Updates
  async createEvent(
    dto: CreateEventDto,
    userId: string,
    file?: Express.Multer.File,
  ) {
    this.logger.log(`Starting event creation for user: ${userId}`);
    this.logger.debug(`DTO received: ${JSON.stringify(dto, null, 2)}`);
    if (file) {
      this.logger.log(`File received: ${file.originalname}`);
    } else {
      this.logger.warn('No file provided');
    }

    if (!dto.ticketCategories || dto.ticketCategories.length === 0) {
      throw new BadRequestException('At least one ticket category is required');
    }

    const bannerUrl = await this.uploadBannerIfProvided(file);
    const slug = await this.generateUniqueSlug(dto.name);

    try {
      const event = await this.prisma.event.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description || dto.name,
          organizerId: userId,
          location: dto.location || 'Not specified',
          date: dto.date,
          category: dto.category,
          isActive: true,
          bannerUrl,
          ticketCategories: {
            create: dto.ticketCategories.map((category) => ({
              name: category.name,
              price: Number(category.price),
              maxTickets: Number(category.maxTickets),
            })),
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          organizerId: true,
          location: true,
          date: true,
          category: true,
          isActive: true,
          bannerUrl: true,
          ticketCategories: true,
        },
      });

      // Invalidate global events cache to ensure new event appears in listings
      await this.invalidateEventCache(event.id, event.slug);
      this.logger.log(`Event created with ID: ${event.id}`);
      return event;
    } catch (err) {
      this.logger.error(`Error creating event: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Failed to create event');
    }
  }

  async updateEvent(
    eventId: string,
    dto: UpdateEventDto,
    userId: string,
    file?: Express.Multer.File,
  ) {
    const event = await this.findEventById(eventId);
    this.validateOwnership(event, userId);

    let bannerUrl: string | undefined;
    if (file) {
      bannerUrl = await this.uploadBannerIfProvided(file);
      if (event.bannerUrl && bannerUrl !== event.bannerUrl) {
        await this.deleteBannerIfExists(event.bannerUrl);
      }
    } else {
      bannerUrl = event.bannerUrl ?? undefined;
    }

    const data: any = {
      name: dto.name || event.name,
      description: dto.description ?? event.description,
      location: dto.location || event.location,
      date: dto.date || event.date,
      category: dto.category || event.category,
      bannerUrl,
    };

    if (dto.ticketCategories) {
      for (const category of dto.ticketCategories) {
        const existingCategory = event.ticketCategories.find(
          (cat) => cat.id === category.id || cat.name === category.name,
        );
        if (!existingCategory) {
          throw new BadRequestException(
            `Ticket category with ID ${category.id || 'unknown'} or name ${category.name || 'unknown'} does not exist`,
          );
        }
        if (
          category.maxTickets !== undefined &&
          existingCategory.minted > category.maxTickets
        ) {
          throw new BadRequestException(
            `Cannot reduce maxTickets for category ${existingCategory.name} below minted tickets (${existingCategory.minted})`,
          );
        }
      }

      data.ticketCategories = {
        update: dto.ticketCategories.map((category) => ({
          where: {
            id:
              category.id ||
              event.ticketCategories.find((cat) => cat.name === category.name)
                ?.id,
          },
          data: {
            price: Number(category.price),
            maxTickets: Number(category.maxTickets),
          },
        })),
      };
    }

    const updatedEvent = await this.prisma.event.update({
      where: { id: eventId },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        organizerId: true,
        location: true,
        date: true,
        category: true,
        isActive: true,
        bannerUrl: true,
        ticketCategories: true,
      },
    });

    // Invalidate cache to reflect updated event data in ticket purchase flow
    await this.invalidateEventCache(eventId, updatedEvent.slug);
    return updatedEvent;
  }

  // Status Management
  async toggleEventStatus(id: string, isActive: boolean, userId: string) {
    const event = await this.findEventById(id);
    this.validateOwnership(event, userId);

    const updatedEvent = await this.prisma.event.update({
      where: { id },
      data: { isActive },
      select: { id: true, isActive: true, slug: true },
    });

    // Invalidate cache to reflect status change (affects ticket purchase eligibility)
    await this.invalidateEventCache(id, updatedEvent.slug);
    return updatedEvent;
  }

  // Deletion
  async deleteEvent(id: string, userId: string) {
    const event = await this.findEventById(id);
    this.validateOwnership(event, userId);
    await this.checkIfTicketsExist(id);
    await this.deleteBannerIfExists(event.bannerUrl!);

    await this.prisma.event.delete({ where: { id } });

    // Invalidate cache to remove deleted event from listings
    await this.invalidateEventCache(id, event.slug);
    return { message: 'Event deleted successfully', eventId: id };
  }

  // Queries
  async getOrganizerEvents(userId: string) {
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
    // Caching organizer events
    // - Used for organizer dashboard to show their events
    // - TTL/SWR for fast response and reduced DB load
    const events = await this.prisma.event.findMany({
      where: { organizerId: userId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        location: true,
        date: true,
        category: true,
        isActive: true,
        bannerUrl: true,
        ticketCategories: true,
      },
      orderBy: { createdAt: 'desc' },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`organizer_events_${sanitizedUserId}`, 'events'],
      },
    });

    if (events.length === 0) {
      return { message: 'You have not created any events yet' };
    }

    return events;
  }

  async getSingleEvent(eventId: string) {
    const sanitizedEventId = this.sanitizeForCacheTag(eventId);
    // Caching single event query
    // - Used in ticket purchase flow for event details page
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        organizerId: true,
        location: true,
        date: true,
        category: true,
        isActive: true,
        bannerUrl: true,
        organizer: { select: { name: true, email: true, profileImage: true } },
        ticketCategories: true,
        tickets: {
          where: { isListed: true },
          select: {
            id: true,
            resalePrice: true,
            listedAt: true,
            ticketCategory: { select: { name: true, price: true } },
            user: {
              select: { id: true, name: true, email: true, profileImage: true },
            },
          },
        },
      },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`event_${sanitizedEventId}`, 'events'],
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    return event;
  }

  async getEventBySlug(slug: string) {
    return this.findEventBySlug(slug);
  }

  async getAllEvents() {
    // Caching all active events
    // - Used in public event listings for ticket browsing
    return this.prisma.event.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        organizerId: true,
        location: true,
        date: true,
        category: true,
        isActive: true,
        bannerUrl: true,
        organizer: { select: { name: true, email: true, profileImage: true } },
        ticketCategories: true,
        tickets: {
          where: { isListed: true },
          select: {
            id: true,
            resalePrice: true,
            listedAt: true,
            ticketCategory: { select: { name: true, price: true } },
            user: {
              select: { id: true, name: true, email: true, profileImage: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: ['events'],
      },
    });
  }

  async getAllEventsFiltered(query: {
    name?: string;
    from?: string;
    to?: string;
  }) {
    // Caching filtered event queries
    // - Used for search functionality in ticket browsing
    const filters: any = { isActive: true };

    if (query.name) {
      filters.name = { contains: query.name, mode: 'insensitive' };
    }

    if (query.from || query.to) {
      filters.createdAt = {};
      if (query.from) filters.createdAt.gte = new Date(query.from);
      if (query.to) filters.createdAt.lte = new Date(query.to);
    }

    return this.prisma.event.findMany({
      where: filters,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        location: true,
        date: true,
        category: true,
        isActive: true,
        bannerUrl: true,
        organizer: { select: { name: true, email: true } },
        ticketCategories: true,
      },
      orderBy: { createdAt: 'desc' },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: ['events'],
      },
    });
  }

  async getUserEvents(userId: string) {
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
    // Caching user-specific ticket queries
    // - Used in ticket purchase history or resale flow
    const tickets = await this.prisma.ticket.findMany({
      where: { userId },
      select: {
        id: true,
        eventId: true,
        userId: true,
        ticketCategoryId: true,
        resalePrice: true,
        isListed: true,
        listedAt: true,
        event: {
          select: {
            id: true,
            name: true,
            slug: true,
            date: true,
            location: true,
            category: true,
            isActive: true,
          },
        },
        ticketCategory: { select: { name: true, price: true } },
      },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`user_tickets_${sanitizedUserId}`],
      },
    });

    const grouped = tickets.reduce(
      (acc, ticket) => {
        const id = ticket.eventId;
        if (!acc[id]) {
          acc[id] = {
            ...ticket.event,
            tickets: [],
            ticketCount: 0,
          };
        }
        acc[id].tickets.push({
          ...ticket,
          ticketCategory: ticket.ticketCategory,
        });
        acc[id].ticketCount++;
        return acc;
      },
      {} as Record<string, any>,
    );

    return Object.values(grouped);
  }

  async getUpcomingEvents() {
    // Caching upcoming events
    // - Used in ticket browsing for future events
    return this.prisma.event.findMany({
      where: {
        isActive: true,
        date: { gte: new Date() },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        location: true,
        date: true,
        category: true,
        isActive: true,
        bannerUrl: true,
        ticketCategories: true,
      },
      orderBy: { date: 'asc' },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: ['events'],
      },
    });
  }

  async getPastEvents() {
    // Caching past events
    // - Less critical but cached for consistency
    return this.prisma.event.findMany({
      where: {
        isActive: true,
        date: { lt: new Date() },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        location: true,
        date: true,
        category: true,
        isActive: true,
        bannerUrl: true,
        ticketCategories: true,
      },
      orderBy: { date: 'desc' },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: ['events'],
      },
    });
  }
}