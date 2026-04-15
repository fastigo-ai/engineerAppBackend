import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI;

// Define a minimal ServicePlan schema for the migration
const ServicePlanSchema = new mongoose.Schema({
  name: String,
  duration: Number
}, { collection: 'servicePlan' });

const ServicePlan = mongoose.model('ServicePlanMigration', ServicePlanSchema);

async function migrateDurations() {
  if (!MONGO_URI) {
    console.error('MONGO_URI not found in environment variables');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected successfully.');

    // Find all service plans missing duration or having duration <= 0
    const services = await ServicePlan.find({
      $or: [
        { duration: { $exists: false } },
        { duration: null },
        { duration: 0 }
      ]
    });

    console.log(`Found ${services.length} services needing duration updates.`);

    let updatedCount = 0;
    for (const service of services) {
      let duration = 60; // Default: 1 hour

      // Smart defaults based on keywords
      const name = service.name.toLowerCase();
      if (name.includes('repair')) duration = 60;
      if (name.includes('service') || name.includes('maintenance')) duration = 45;
      if (name.includes('cleaning')) duration = 120;
      if (name.includes('installation')) duration = 90;
      if (name.includes('inspection') || name.includes('diagnosis')) duration = 30;
      if (name.includes('checkup')) duration = 20;

      await ServicePlan.updateOne(
        { _id: service._id },
        { $set: { duration: duration } }
      );
      updatedCount++;
    }

    console.log(`Migration complete! Updated ${updatedCount} services.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateDurations();
