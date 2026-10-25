// Taskly server: static UI + a small JSON API. Todos live in memory for the life of the process.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let todos = [];
let nextId = 1;

app.get('/api/todos', (_req, res) => res.json(todos));

app.post('/api/todos', (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  const todo = { id: nextId++, title, done: false };
  todos.push(todo);
  res.status(201).json(todo);
});

app.patch('/api/todos/:id', (req, res) => {
  const todo = todos.find(t => t.id === req.params.id);
  if (!todo) return res.status(404).json({ error: 'not found' });
  if (typeof req.body.done === 'boolean') todo.done = req.body.done;
  res.json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
  const id = Number(req.params.id);
  todos = todos.filter(t => t.id !== id);
  res.status(204).end();
});

// Test helper: wipe all state so each test starts from an empty list.
app.post('/api/reset', (_req, res) => {
  todos = [];
  nextId = 1;
  res.status(204).end();
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => console.log(`Taskly on http://localhost:${PORT}`));
