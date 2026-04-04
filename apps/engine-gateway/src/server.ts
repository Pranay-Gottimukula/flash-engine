// apps/engine-gateway/src/server.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import prisma from './lib/prisma';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Basic health check route
app.get('/health', async (req, res) => {
  // 2. You can test it right here to make sure it connects
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'Engine Gateway is ALIVE and DB is connected!' });
  } catch (error) {
    res.status(500).json({ error: "Database connection failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Engine Gateway running on http://localhost:${PORT}`);
});