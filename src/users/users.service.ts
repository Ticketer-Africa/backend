import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly redisService: RedisService,
  ) {}

  // =====================
  // HELPER METHODS
  // =====================

  private async findUserById(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`User not found with ID: ${userId}`);
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async findUserByEmail(email: string) {
    const cacheKey = `user:email:${email}`;
    // Check Redis cache for user data
    const cachedUser = await this.redisService.get<{
      id: string;
      email: string;
      role: string;
    }>(cacheKey);
    if (cachedUser) {
      this.logger.log(`Cache hit for user with email: ${email}`);
      if (!cachedUser) throw new NotFoundException('User not found');
      return cachedUser;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      this.logger.warn(`User not found with email: ${email}`);
      throw new NotFoundException('User not found');
    }

    // Cache user data with a 5-minute TTL
    await this.redisService.set(
      cacheKey,
      { id: user.id, email: user.email, role: user.role },
      300,
    );
    return user;
  }

  private async handlePasswordUpdate(password: string, userId: string) {
    if (password.length < 6) {
      this.logger.warn(`Password too short for user ID: ${userId}`);
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const hashed = await bcrypt.hash(password, 10);
    this.logger.log(`Password hashed for user ID: ${userId}`);
    return hashed;
  }

  private async handleImageUpload(file: Express.Multer.File) {
    try {
      const uploadedImageUrl = await this.cloudinary.uploadImage(
        file,
        'ticketer/profiles',
      );
      this.logger.log(`Image uploaded successfully: ${uploadedImageUrl}`);
      return uploadedImageUrl;
    } catch (err) {
      this.logger.error(`Image upload failed: ${err.message}`);
      throw new InternalServerErrorException('Failed to upload profile image');
    }
  }

  private async promoteToOrganizer(userId: string) {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'ORGANIZER' },
    });

    // Update user cache after role change
    const cacheKey = `user:email:${updatedUser.email}`;
    await this.redisService.set(
      cacheKey,
      { id: updatedUser.id, email: updatedUser.email, role: updatedUser.role },
      300,
    );
  }

  private async ensureWalletExists(userId: string) {
    const cacheKey = `wallet:exists:${userId}`;
    // Check Redis cache for wallet existence
    const cachedWalletExists = await this.redisService.get<boolean>(cacheKey);
    if (cachedWalletExists === false) {
      this.logger.log(`Cache hit: No wallet exists for user ID: ${userId}`);
      // Create wallet and cache its existence
      const wallet = await this.prisma.wallet.create({ data: { userId } });
      await this.redisService.set(cacheKey, true, 86400); // Cache for 24 hours
      return wallet;
    }

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      const newWallet = await this.prisma.wallet.create({ data: { userId } });
      // Cache wallet existence with a 24-hour TTL
      await this.redisService.set(cacheKey, true, 86400);
      return newWallet;
    }
    // Cache existing wallet with a 24-hour TTL
    await this.redisService.set(cacheKey, true, 86400);
    return null;
  }

  // =====================
  // PUBLIC METHODS
  // =====================

  async becomeOrganizer(email: string) {
    const user = await this.findUserByEmail(email);

    if (user.role === 'ORGANIZER') {
      this.logger.warn(`User with email ${email} is already an organizer`);
      throw new BadRequestException('User is already an organizer');
    }

    await this.promoteToOrganizer(user.id);

    const wallet = await this.ensureWalletExists(user.id);

    if (wallet) {
      this.logger.log(`Wallet created for user ID: ${user.id}`);
      return { message: 'Wallet created successfully', walletId: wallet.id };
    }

    this.logger.log(`User with email ${email} promoted to organizer`);
    return { message: 'You are now an organizer!' };
  }

  // =====================
  // PUBLIC METHODS
  // =====================

  async getCurrentUser(userId: string) {
    this.logger.log(`Fetching user with ID: ${userId}`);
    const user = await this.findUserById(userId);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profileImage: user.profileImage,
        isVerified: user.isVerified,
      },
    };
  }

  async updateUser(
    userId: string,
    dto: UpdateUserDto,
    file?: Express.Multer.File,
  ) {
    this.logger.log(`Updating user with ID: ${userId}`);

    const user = await this.findUserById(userId);

    const hashedPassword = dto.password
      ? await this.handlePasswordUpdate(dto.password, userId)
      : undefined;

    const uploadedImageUrl = file
      ? await this.handleImageUpload(file)
      : undefined;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name ?? user.name,
        password: hashedPassword ?? user.password,
        profileImage: uploadedImageUrl ?? user.profileImage,
      },
    });

    this.logger.log(`User updated successfully: ${userId}`);

    return {
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        profileImage: updatedUser.profileImage,
        isVerified: updatedUser.isVerified,
      },
    };
  }
}
