import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp';

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(MONGODB_URI);
  console.log('[mongo] connected to', MONGODB_URI);
  return mongoose.connection;
}

export default mongoose;
