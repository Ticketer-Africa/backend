/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable prettier/prettier */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const ADMIN_EMAIL = 'admin@example.com';

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

const categories = ['MUSIC', 'CONCERT', 'CONFERENCE', 'WORKSHOP', 'SPORTS'];

const sampleNames = [
  'Aisha', 'Chinedu', 'Bola', 'Olu', 'Ngozi', 'Tunde', 'Ife', 'Kemi',
  'Sani', 'David', 'Fatima', 'Grace', 'Ibrahim', 'Sarah', 'Michael',
  'Ada', 'John', 'Mary', 'Peter', 'Ruth',
];

const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

const mkEventName = (cat: string, idx: number) =>
  `${cat[0] + cat.slice(1).toLowerCase()} Expo ${idx + 1}`;

const toDecimalString = (n: number) => n.toFixed(2);

async function main() {
  console.log('🌱 Starting lightweight seed...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1) Create admin
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: 'Platform Admin',
      password: hashedPassword,
      role: 'ADMIN',
      isVerified: true,
      wallet: { create: { balance: toDecimalString(500000) } },
    },
  });

  // 2) Create 5 organizers
  const organizers: any[] = [];
  for (let i = 0; i < 5; i++) {
    const organizer = await prisma.user.create({
      data: {
        email: `organizer${i + 1}@example.com`,
        name: `${pick(sampleNames)} Organizer ${i + 1}`,
        password: hashedPassword,
        role: 'ORGANIZER',
        isVerified: true,
        wallet: { create: { balance: toDecimalString(randInt(5000, 50000)) } },
      },
    });
    organizers.push(organizer);
  }

  // 3) Create 14 regular users
  const users: any[] = [];
  for (let i = 0; i < 14; i++) {
    const user = await prisma.user.create({
      data: {
        email: `user${i + 1}@example.com`,
        name: `${pick(sampleNames)} User ${i + 1}`,
        password: hashedPassword,
        role: 'USER',
        isVerified: true,
        wallet: { create: { balance: toDecimalString(randInt(0, 20000)) } },
      },
    });
    users.push(user);
  }

  const buyers = [admin, ...organizers, ...users];

  // 4) Create 1-2 events per organizer
  const allEvents: any[] = [];
  for (const organizer of organizers) {
    const eventsForThisOrganizer = randInt(1, 2);
    for (let e = 0; e < eventsForThisOrganizer; e++) {
      const cat = pick(categories);
      const slug = `${cat.toLowerCase()}-${organizer.name.replace(/\s+/g, '-').toLowerCase()}-${allEvents.length}`;
      const event = await prisma.event.create({
        data: {
          name: mkEventName(cat, allEvents.length),
          category: cat as any,
          slug: slug.slice(0, 50),
          description: `${lorem} ${cat} focused event.`,
          location: pick(['Lagos', 'Abuja', 'Accra']),
          date: new Date(Date.now() + randInt(1, 15) * 24 * 60 * 60 * 1000),
          organizerId: organizer.id,
          primaryFeeBps: pick([350, 500]),
          resaleFeeBps: pick([350, 500]),
          royaltyFeeBps: pick([500, 1000]),
        },
      });
      allEvents.push(event);
    }
  }

  // 5) Create 1-2 ticket categories per event
  for (const event of allEvents) {
    const catCount = randInt(1, 2);
    for (let c = 0; c < catCount; c++) {
      const name = pick(['VIP', 'Regular', 'Standard']);
      const price = pick([1500, 3000, 5000]);
      await prisma.ticketCategory.create({
        data: {
          name,
          price,
          maxTickets: pick([50, 100]),
          eventId: event.id,
          minted: 0,
        },
      });
    }
  }

  console.log('✅ Seed complete: 20 users, a few events, and ticket categories created.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
