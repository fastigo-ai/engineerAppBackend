import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        await mongoose.connect("mongodb+srv://fastigolvtltd:pfvA2CwhHE61mO3z@cluster0.knkkbr1.mongodb.net/door2fy");
        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection error:', error);
    }
};

export default connectDB;