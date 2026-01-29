import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { SHARED_CONSTANTS } from '@sheets-sync/shared';

import authRoutes from './routes/auth.routes.js';
import googleRoutes from './routes/google.routes.js';
import mysqlRoutes from './routes/mysql.routes.js';
import integrationRoutes from './routes/integration.routes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/mysql', mysqlRoutes);
app.use('/api/integrations', integrationRoutes);

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        appName: SHARED_CONSTANTS.APP_NAME,
        version: SHARED_CONSTANTS.VERSION
    });
});

app.listen(port, () => {
    console.log(`[API] Server running on port ${port}`);
});
