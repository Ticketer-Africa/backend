/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable prettier/prettier */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@example.com';

// Helpers
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

const categories = [
  'MUSIC',
  'CONCERT',
  'CONFERENCE',
  'WORKSHOP',
  'SPORTS',
  'COMEDY',
  'THEATRE',
  'FESTIVAL',
  'EXHIBITION',
  'RELIGION',
  'NETWORKING',
  'TECH',
  'FASHION',
  'PARTY',
];

const sampleNames = [
  'Aisha', 'Chinedu', 'Bola', 'Olu', 'Ngozi', 'Tunde', 'Ife', 'Kemi',
  'Sani', 'David', 'Fatima', 'Grace', 'Ibrahim', 'Sarah', 'Michael',
  'Ada', 'John', 'Mary', 'Peter', 'Ruth',
];

const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

// Generate a readable event name base
const mkEventName = (cat: string, idx: number) =>
  `${cat[0] + cat.slice(1).toLowerCase()} Expo ${idx + 1}`;

// Format wallet initial balance (use Decimal string)
const toDecimalString = (n: number) => n.toFixed(2);

async function main() {
  console.log('🌱 Starting full seed...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1) create admin (upsert to be idempotent)
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

  console.log('✅ Admin created');

  // 2) create ~100 organizers
  const organizerCount = 100;
  const organizerPromises = Array.from({ length: organizerCount }).map(
    async (_, i) => {
      const name = `${pick(sampleNames)} Organizer ${i + 1}`;
      const email = `organizer${i + 1}@example.com`;
      return prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: 'ORGANIZER',
          isVerified: Math.random() > 0.1, // some unverified
          wallet: { create: { balance: toDecimalString(randInt(5000, 50000)) } },
          createdAt: new Date(Date.now() - randInt(0, 1000 * 60 * 60 * 24 * 90)), // some created in last 90 days
        },
      });
    },
  );

  const organizers = await Promise.all(organizerPromises);
  console.log(`✅ Created ${organizers.length} organizers`);

  // 3) create ~899 regular users (to total 1000 users: 1 admin + 100 organizers + 899 = 1000)
  const regularUsersCount = 899;
  const userPromises: Promise<any>[] = [];
  for (let i = 0; i < regularUsersCount; i++) {
    const name = `${pick(sampleNames)} User ${i + 1}`;
    const email = `user${i + 1}@example.com`;
    const initialBalance = randInt(0, 20000); // some have 0 balance
    userPromises.push(
      prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: 'USER',
          isVerified: Math.random() > 0.2,
          wallet: { create: { balance: toDecimalString(initialBalance) } },
          createdAt: new Date(Date.now() - randInt(0, 1000 * 60 * 60 * 24 * 120)),
        },
      }),
    );
  }
  const users = await Promise.all(userPromises);
  console.log(`✅ Created ${users.length} regular users`);

  // Helper to fetch all buyers pool
  const buyers = [admin, ...organizers, ...users];

  // 4) For each organizer create random events (1..5)
  const allEvents: any[] = [];
  for (const organizer of organizers) {
    const eventsForThisOrganizer = randInt(1, 5);
    for (let e = 0; e < eventsForThisOrganizer; e++) {
      const cat = pick(categories) as any;
      const idx = allEvents.length;
      const slug = `${cat.toLowerCase()}-${organizer.name.replace(/\s+/g, '-').toLowerCase()}-${idx}`;
      const event = await prisma.event.create({
        data: {
          name: mkEventName(cat, idx),
          category: cat,
          slug: slug.slice(0, 50),
          description: `${lorem} ${cat} focused event.`,
          location: pick(['Lagos', 'Abuja', 'Accra', 'Nairobi', 'London', 'New York']),
          date: new Date(Date.now() + randInt(1, 30) * 24 * 60 * 60 * 1000), // next 30 days
          organizerId: organizer.id,
          primaryFeeBps: pick([350, 500, 750]), // 3.5%, 5%, 7.5%
          resaleFeeBps: pick([350, 500]),
          royaltyFeeBps: pick([500, 1000, 1500]),
        },
      });

      allEvents.push(event);
    }
  }

  console.log(`🎉 Created ${allEvents.length} events`);

  // 5) For each event create 2-4 ticket categories
  const allTicketCategories: any[] = [];
  for (const event of allEvents) {
    const catCount = randInt(2, 4);
    const categoriesForEvent: any[] = [];
    for (let c = 0; c < catCount; c++) {
      const name = pick(['VVIP', 'VIP', 'Regular', 'Balcony', 'Standard']);
      const price = pick([1500, 3000, 5000, 8000, 12000]) + randInt(-500, 1500);
      const maxTickets = pick([50, 100, 200, 300, 500]);
      const tc = await prisma.ticketCategory.create({
        data: {
          name,
          price,
          maxTickets,
          eventId: event.id,
          minted: 0,
        },
      });
      categoriesForEvent.push(tc);
      allTicketCategories.push(tc);
    }
    // console.log(`  Event ${event.id} categories: ${categoriesForEvent.length}`);
  }
  console.log(`🎟️ Created ${allTicketCategories.length} ticket categories`);

  // 6) Mint tickets for events (simulate primary purchases)
  // We'll randomize number of tickets minted per category (up to 70% of maxTickets but cap for seeding)
  const mintedTickets: any[] = [];
  for (const cat of allTicketCategories) {
    // limit heavy seeding by capping minted per category
    const cap = Math.min(cat.maxTickets, randInt(Math.floor(cat.maxTickets * 0.1), Math.floor(cat.maxTickets * 0.6)));
    for (let m = 0; m < cap; m++) {
      // pick a random buyer (prefer regular users)
      const buyer = pick(users);
      // create ticket
      const ticketCode = `TCKT-${cat.eventId.slice(0, 6)}-${cat.id.slice(0, 6)}-${m}-${randomUUID().slice(0, 6)}`;
      const ticket = await prisma.ticket.create({
        data: {
          code: ticketCode,
          userId: buyer.id,
          eventId: cat.eventId,
          ticketCategoryId: cat.id,
        },
      });
      mintedTickets.push(ticket);

      // update category minted
      await prisma.ticketCategory.update({
        where: { id: cat.id },
        data: { minted: { increment: 1 } },
      });

      // create purchase transaction (primary)
      const txnRef = `txn_${randomUUID()}`;
      const txn = await prisma.transaction.create({
        data: {
          reference: txnRef,
          userId: buyer.id,
          eventId: cat.eventId,
          type: 'PURCHASE',
          amount: cat.price,
          status: 'SUCCESS',
          tickets: {
            create: [{ ticketId: ticket.id }],
          },
        },
      });

      // optionally mark some tickets as listed for resale (random)
      if (Math.random() < 0.05) {
        // list ticket for resale
        const resalePrice = Math.round(cat.price * (1 + Math.random() * 0.4)); // 0-40% higher
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            isListed: true,
            resalePrice,
            listedAt: new Date(),
            resaleCommission: Math.round(resalePrice * 0.05),
          },
        });
      }
    }
  }

  console.log(`✅ Minted ${mintedTickets.length} tickets and created purchase transactions`);

  // 7) Create some resale transactions (transfer ticket ownership + resale transaction)
  // We'll pick ~8% of minted tickets to be resold
  const resaleCountTarget = Math.floor(mintedTickets.length * 0.08);
  let resaleDone = 0;
  const shuffled = mintedTickets.sort(() => Math.random() - 0.5);

  for (const ticket of shuffled) {
    if (resaleDone >= resaleCountTarget) break;
    // only resale some
    if (Math.random() > 0.35) continue;

    // buyer is a different random user
    const seller = await prisma.user.findUnique({ where: { id: ticket.userId } });
    const buyer = pick(users.filter((u) => u.id !== seller?.id));

    // determine resale price (some markup)
    const resalePrice = ticket.resalePrice ?? Math.max(1000, randInt(1000, 20000));
    // create resale transaction
    const txnRef = `resale_${randomUUID()}`;
    await prisma.transaction.create({
      data: {
        reference: txnRef,
        userId: buyer.id,
        eventId: ticket.eventId,
        type: 'RESALE',
        amount: resalePrice,
        status: 'SUCCESS',
        tickets: {
          create: [{ ticketId: ticket.id }],
        },
      },
    });

    // update ticket owner & resale fields
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        userId: buyer.id,
        soldTo: buyer.id,
        resaleCount: { increment: 1 },
        isListed: false,
      },
    });

    resaleDone++;
  }

  console.log(`🔁 Created ${resaleDone} resale transactions`);

  // 8) Create some random fund / withdraw transactions for wallets (simulate activity)
  const randomTxns = 200;
  for (let i = 0; i < randomTxns; i++) {
    const user = pick(buyers);
    const type = Math.random() < 0.6 ? 'FUND' : 'WITHDRAW';
    const amount = randInt(500, 50000);
    await prisma.transaction.create({
      data: {
        reference: `${type.toLowerCase()}_${randomUUID()}`,
        userId: user.id,
        type,
        amount,
        status: Math.random() < 0.95 ? 'SUCCESS' : 'FAILED',
      },
    });
  }

  console.log(`💸 Created ${randomTxns} random fund/withdraw transactions`);

  // 9) (Optional) Create event payouts records (EventPayout) for a subset of events
  for (const ev of allEvents.slice(0, Math.floor(allEvents.length * 0.3))) {
    // calculate approximate balance from event transactions
    const txns = await prisma.transaction.findMany({
      where: { eventId: ev.id, status: 'SUCCESS' },
      select: { amount: true },
    });
    const total = txns.reduce((s, t) => s + (t.amount ?? 0), 0);
    const payout = Math.round(total * 0.9); // pretend 90% owed to organizer
    // ensure organizer exists
    const organizer = await prisma.user.findUnique({ where: { id: ev.organizerId } });
    if (!organizer) continue;
    // create or upsert EventPayout
    await prisma.eventPayout.upsert({
      where: { eventId: ev.id },
      update: { balance: payout, organizerId: organizer.id },
      create: {
        eventId: ev.id,
        organizerId: organizer.id,
        balance: payout,
      },
    });
  }

  console.log('🏁 Seed complete. All done!');
}
main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

