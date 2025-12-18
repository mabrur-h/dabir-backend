import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import 'dotenv/config';
import { subscriptionPlans, minutePackages } from './schema.js';
import { eq } from 'drizzle-orm';

const seedData = async () => {
  console.log('🌱 Seeding subscription plans and packages...');

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    // Seed subscription plans
    const plans = [
      {
        name: 'free',
        displayName: 'Free',
        displayNameUz: 'Bepul',
        priceUzs: 0,
        minutesPerMonth: 60,
        description: 'Try UzNotes with 60 free minutes per month',
        descriptionUz: 'UzNotes-ni oyiga 60 bepul daqiqa bilan sinab ko\'ring',
        features: [
          '60 minutes/month',
          'Basic transcription',
          'AI summaries',
          'Telegram & Web access',
        ],
        featuresUz: [
          'Oyiga 60 daqiqa',
          'Oddiy transkriptsiya',
          'AI xulosalar',
          'Telegram va Web',
        ],
        isActive: true,
        sortOrder: 0,
      },
      {
        name: 'starter',
        displayName: 'Starter',
        displayNameUz: 'Boshlang\'ich',
        priceUzs: 99000,
        minutesPerMonth: 300,
        description: '5 hours of video processing per month',
        descriptionUz: 'Oyiga 5 soat video qayta ishlash',
        features: [
          '300 minutes/month (5 hours)',
          'Unlimited transcription',
          'AI summaries',
          'Telegram & Web access',
        ],
        featuresUz: [
          'Oyiga 300 daqiqa (5 soat)',
          'Cheksiz transkriptsiya',
          'AI xulosalar',
          'Telegram va Web',
        ],
        isActive: true,
        sortOrder: 1,
      },
      {
        name: 'pro',
        displayName: 'Pro',
        displayNameUz: 'Professional',
        priceUzs: 189000,
        minutesPerMonth: 900,
        description: '15 hours of video processing per month',
        descriptionUz: 'Oyiga 15 soat video qayta ishlash',
        features: [
          '900 minutes/month (15 hours)',
          'Unlimited transcription',
          'AI summaries',
          'CustDev analysis',
          'Telegram & Web access',
          'Folders & tags',
        ],
        featuresUz: [
          'Oyiga 900 daqiqa (15 soat)',
          'Cheksiz transkriptsiya',
          'AI xulosalar',
          'CustDev tahlil',
          'Telegram va Web',
          'Papkalar va teglar',
        ],
        isActive: true,
        sortOrder: 2,
      },
      {
        name: 'business',
        displayName: 'Business',
        displayNameUz: 'Biznes',
        priceUzs: 349000,
        minutesPerMonth: 2400,
        description: '40 hours of video processing per month',
        descriptionUz: 'Oyiga 40 soat video qayta ishlash',
        features: [
          '2400 minutes/month (40 hours)',
          'Unlimited transcription',
          'AI summaries',
          'CustDev analysis',
          'Mind maps',
          'Telegram & Web access',
          'Folders & tags',
          'Priority support',
        ],
        featuresUz: [
          'Oyiga 2400 daqiqa (40 soat)',
          'Cheksiz transkriptsiya',
          'AI xulosalar',
          'CustDev tahlil',
          'Mind map',
          'Telegram va Web',
          'Papkalar va teglar',
          'Ustuvor qo\'llab-quvvatlash',
        ],
        isActive: true,
        sortOrder: 3,
      },
    ];

    // Seed minute packages
    const packages = [
      {
        name: '1hr',
        displayName: '1 Hour',
        displayNameUz: '1 soat',
        priceUzs: 36000,
        minutes: 60,
        description: 'Add 1 hour of processing time',
        descriptionUz: 'Qo\'shimcha 1 soat qayta ishlash vaqti',
        isActive: true,
        sortOrder: 0,
      },
      {
        name: '5hr',
        displayName: '5 Hours',
        displayNameUz: '5 soat',
        priceUzs: 229000,
        minutes: 300,
        description: 'Add 5 hours of processing time (save 37%)',
        descriptionUz: 'Qo\'shimcha 5 soat qayta ishlash vaqti (37% tejash)',
        isActive: true,
        sortOrder: 1,
      },
      {
        name: '10hr',
        displayName: '10 Hours',
        displayNameUz: '10 soat',
        priceUzs: 289000,
        minutes: 600,
        description: 'Add 10 hours of processing time (save 52%)',
        descriptionUz: 'Qo\'shimcha 10 soat qayta ishlash vaqti (52% tejash)',
        isActive: true,
        sortOrder: 2,
      },
    ];

    // Insert plans (upsert - update if exists)
    console.log('📦 Seeding subscription plans...');
    for (const plan of plans) {
      const existing = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, plan.name))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(subscriptionPlans)
          .set({
            ...plan,
            updatedAt: new Date(),
          })
          .where(eq(subscriptionPlans.name, plan.name));
        console.log(`  ✏️  Updated plan: ${plan.name}`);
      } else {
        await db.insert(subscriptionPlans).values(plan);
        console.log(`  ➕ Created plan: ${plan.name}`);
      }
    }

    // Insert packages (upsert)
    console.log('📦 Seeding minute packages...');
    for (const pkg of packages) {
      const existing = await db
        .select()
        .from(minutePackages)
        .where(eq(minutePackages.name, pkg.name))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(minutePackages)
          .set({
            ...pkg,
            updatedAt: new Date(),
          })
          .where(eq(minutePackages.name, pkg.name));
        console.log(`  ✏️  Updated package: ${pkg.name}`);
      } else {
        await db.insert(minutePackages).values(pkg);
        console.log(`  ➕ Created package: ${pkg.name}`);
      }
    }

    console.log('✅ Seeding completed successfully!');

    // Display current data
    const allPlans = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
    const allPackages = await db.select().from(minutePackages).orderBy(minutePackages.sortOrder);

    console.log('\n📊 Current Subscription Plans:');
    console.table(
      allPlans.map((p) => ({
        name: p.name,
        displayName: p.displayName,
        price: `${p.priceUzs.toLocaleString()} UZS`,
        minutes: p.minutesPerMonth,
        active: p.isActive,
      }))
    );

    console.log('\n📊 Current Minute Packages:');
    console.table(
      allPackages.map((p) => ({
        name: p.name,
        displayName: p.displayName,
        price: `${p.priceUzs.toLocaleString()} UZS`,
        minutes: p.minutes,
        active: p.isActive,
      }))
    );
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

seedData();
