// Demo target app: a tiny todo list. The pipeline fixes bugs in app/public/*.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => console.log(`demo app on http://localhost:${PORT}`));
