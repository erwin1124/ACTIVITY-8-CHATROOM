import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { connectMongo } from './mongodb';
import { initSocket } from './socket';
import * as express from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import mongoose from 'mongoose';

dotenv.config();

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to', mongoose.connection.db?.databaseName, 'state=', mongoose.connection.readyState);
});

async function bootstrap() {
  try {
    await connectMongo();
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
  }

  const app = await NestFactory.create(AppModule);

  // Configure CORS. Accept multiple comma-separated origins in FRONTEND_ORIGIN.
  const frontendOrigin = process.env.FRONTEND_ORIGIN; 
  if (!frontendOrigin) {
    // no origin configured: allow all origins (no credentials)
    app.enableCors({
      origin: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type, Authorization, Accept',
      credentials: false,
    });
  } else {
    const allowedOrigins = frontendOrigin.split(',').map((s) => s.trim()).filter(Boolean);
    app.enableCors({
      origin: (origin, callback) => {
        // allow requests with no origin (like curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type, Authorization, Accept',
      credentials: true,
    });
  }

  const expressApp = app.getHttpAdapter().getInstance() as express.Express;

  // ensure uploads dir
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  // serve uploads directory (CORS already enabled on Nest routes)
  expressApp.use('/uploads', express.static(uploadsDir));

  // initialize Nest app (attach routes, middleware)
  await app.init();

  // create http server and init socket.io
  const server = http.createServer(expressApp);
  initSocket(server);

  await new Promise<void>((resolve) => server.listen(Number(process.env.PORT) || 4000, resolve));
  console.log(`Server listening on ${process.env.PORT || 4000}`);
}
bootstrap();
