# Activity-8 Backend

This backend uses NestJS + TypeScript, MongoDB (mongoose) for persistence, JWT for authentication, local file uploads for attachments, and Socket.IO for real-time message events.

Quick start (local dev):

1. Install dependencies
   - cd backend
   - npm install

2. Copy `.env.example` to `.env` and edit values (see `.env.example`).

3. Ensure MongoDB is running and accessible from `MONGODB_URI` (defaults to `mongodb://localhost:27017/chatapp`). For local testing you can run a local mongod or use a Docker container.

4. Run dev server
   - npm run start:dev

Notes:
- Auth: use the backend endpoints `/auth/signup` and `/auth/login`. Both return a JWT token which the frontend stores and sends in the `Authorization: Bearer <token>` header.
- Storage: file uploads are handled by the backend and saved to a local `uploads/` directory, served at `http://<server>/uploads/<filename>`.
- Real-time: Socket.IO is enabled. After logging in the frontend should connect the socket and join chatroom rooms to receive `message:new` events.

Postman examples are provided in `POSTMAN_COLLECTION.json` — update request tokens to use the JWT returned by `/auth/login`.
