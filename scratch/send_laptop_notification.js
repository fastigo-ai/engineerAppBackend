import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../src/models/user.js';
import Notification from '../src/modules/notification/Notification.model.js';
import { enqueueBulk } from '../src/modules/notification/notification.service.js';

const __dirname = path.resolve();
dotenv.config({ path: path.join(__dirname, '.env') });

async function broadcastOrderNotification() {
  try {
    console.log('--- STARTING STAGGERED BROADCAST ---');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // 1. Fetch all users
    const users = await User.find({}).select('_id').lean();
    const userIds = users.map(u => u._id);

    if (userIds.length === 0) {
      console.log('No users found in the database.');
      process.exit(0);
    }

    const batchSize = 10;
    const staggerMinutes = 1;

    console.log(`Targeting ${userIds.length} users in batches of ${batchSize} with ${staggerMinutes}min delay...`);

    const docs = userIds.map((userId, index) => {
      const batchIndex = Math.floor(index / batchSize);
      const staggerDelayMs = batchIndex * (staggerMinutes * 60000);
      
      return {
        userId,
        userModel: 'User',
        type: 'SYSTEM',
        title: 'Support Check',
        body: 'hey is your laptop is buffring?',
        data: { category: 'LAPTOP_REPAIR' },
        status: 'PENDING',
        nextRunAt: new Date(Date.now() + staggerDelayMs)
      };
    });

    // 2. Insert into queue
    const result = await Notification.insertMany(docs, { ordered: false });

    console.log('✅ Successfully enqueued staggered broadcast!');
    console.log(`Summary: ${result.length} jobs created across ${Math.ceil(result.length / batchSize)} waves.`);
    
    // Log the times for verification
    const distinctTimes = [...new Set(docs.map(d => d.nextRunAt.toLocaleTimeString()))];
    console.log('Scheduled waves at:', distinctTimes.join(', '));
    
    process.exit(0);
  } catch (error) {
    console.error('Broadcast failed:', error);
    process.exit(1);
  }
}

broadcastOrderNotification();
