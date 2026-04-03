import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import dealsRouter from './routes/deals';
import invoicesRouter from './routes/invoices';
import contactsRouter from './routes/contacts';
import accountsRouter from './routes/accounts';

const app = express();
const PORT = 8000;

app.use(cors({
    // Allow any localhost port in dev (port changes when 5173 is already in use)
    origin: (origin, callback) => {
        if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
            callback(null, true);
        } else if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin not allowed — ${origin}`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
}));

app.use(express.json());

app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'Northwoods Invoice Readiness API' });
});

app.use('/deals', dealsRouter);
app.use('/invoices', invoicesRouter);
app.use('/contacts', contactsRouter);
app.use('/accounts', accountsRouter);

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
