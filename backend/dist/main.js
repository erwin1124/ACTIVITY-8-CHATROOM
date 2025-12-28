"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const dotenv = __importStar(require("dotenv"));
const mongodb_1 = require("./mongodb");
const socket_1 = require("./socket");
const express = __importStar(require("express"));
const http = __importStar(require("http"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const mongoose_1 = __importDefault(require("mongoose"));
dotenv.config();
mongoose_1.default.connection.on('connected', () => {
    console.log('Mongoose connected to', mongoose_1.default.connection.db?.databaseName, 'state=', mongoose_1.default.connection.readyState);
});
async function bootstrap() {
    try {
        await (0, mongodb_1.connectMongo)();
    }
    catch (err) {
        console.error('Failed to connect to MongoDB', err);
    }
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    // Configure CORS. Accept multiple comma-separated origins in FRONTEND_ORIGIN.
    const frontendOrigin = process.env.FRONTEND_ORIGIN; // e.g. "http://localhost:5173,http://localhost:5174"
    if (!frontendOrigin) {
        // no origin configured: allow all origins (no credentials)
        app.enableCors({
            origin: true,
            methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
            allowedHeaders: 'Content-Type, Authorization, Accept',
            credentials: false,
        });
    }
    else {
        const allowedOrigins = frontendOrigin.split(',').map((s) => s.trim()).filter(Boolean);
        app.enableCors({
            origin: (origin, callback) => {
                // allow requests with no origin (like curl, server-to-server)
                if (!origin)
                    return callback(null, true);
                if (allowedOrigins.includes(origin))
                    return callback(null, true);
                return callback(null, false);
            },
            methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
            allowedHeaders: 'Content-Type, Authorization, Accept',
            credentials: true,
        });
    }
    const expressApp = app.getHttpAdapter().getInstance();
    // ensure uploads dir
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir))
        fs.mkdirSync(uploadsDir, { recursive: true });
    // serve uploads directory (CORS already enabled on Nest routes)
    expressApp.use('/uploads', express.static(uploadsDir));
    // initialize Nest app (attach routes, middleware)
    await app.init();
    // create http server and init socket.io
    const server = http.createServer(expressApp);
    (0, socket_1.initSocket)(server);
    await new Promise((resolve) => server.listen(Number(process.env.PORT) || 4000, resolve));
    console.log(`Server listening on ${process.env.PORT || 4000}`);
}
bootstrap();
