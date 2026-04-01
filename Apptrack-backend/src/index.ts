import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import applicationsRouter from './routes/applications';
import cors from 'cors';
import { auth } from './lib/auth';

const app = express();
const PORT = 8000;

if (!process.env.FRONTEND_URL) {
    throw new Error('Missing frontend URL');
}

app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// Better-auth handler - must be before express.json() for auth routes
app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Welcome to the Application Tracking API!');
});

// Register routes
app.use('/applications', applicationsRouter);

app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});
