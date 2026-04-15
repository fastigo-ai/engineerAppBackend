import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ServicePlan } from '../models/serviceModal.js';

dotenv.config();

const updateDuration = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected successfully.');

    // Find and update the specific service
    const result = await ServicePlan.updateMany(
      { name: { $regex: /Display Issue/i } },
      { $set: { duration: 90 } }
    );

    console.log(`Updated ${result.modifiedCount} service(s) named 'Display Issue' to 90 mins.`);

    // Also update any others that might be relevant
    const keyboard = await ServicePlan.updateMany(
        { name: { $regex: /Keyboard/i } },
        { $set: { duration: 45 } }
      );
      console.log(`Updated ${keyboard.modifiedCount} Keyboard services to 45 mins.`);

    process.exit(0);
  } catch (error) {
    console.error('Error during update:', error);
    process.exit(1);
  }
};

updateDuration();
