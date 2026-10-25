// Taskly — minimal todo app.
// State lives in memory + localStorage. Rendering is a full re-draw.

const STORAGE_KEY = 'taskly.todos';

let todos = load();
let filter = 'all';
let nextId = todos.reduce((m, t) => Math.max(m, t.id), 0) + 1;

const listEl = document.getElementById('list');
const formEl = document.getElementById('add-form');
const inputEl = document.getElementById('new-todo');
const filterBtns = Array.from(document.querySelectorAll('.filters button'));

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(todos)); } catch {}
}

function visibleTodos() {
  if (filter === 'active') return todos.filter(t => !t.done);
  if (filter === 'done') return todos.filter(t => t.done);
  return todos;
}

function addTodo(title) {
  todos.push({ id: nextId++, title, done: false });
  save();
  render();
}

function toggleTodo(id) {
  const t = todos.find(t => t.id === id);
  if (t) t.done = !t.done;
  save();
  render();
}

function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  save();
  render();
}

function setFilter(next) {
  filter = next;
  filterBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === next)));
  render();
}

function render() {
  const items = visibleTodos();
  listEl.innerHTML = '';
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing here.';
    listEl.appendChild(li);
    return;
  }
  items.forEach(t => {
    const li = document.createElement('li');
    li.dataset.id = String(t.id);
    if (t.done) li.classList.add('done');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = t.done;
    cb.setAttribute('aria-label', `Mark ${t.title} ${t.done ? 'not done' : 'done'}`);
    cb.addEventListener('change', () => toggleTodo(t.id));

    const span = document.createElement('span');
    span.className = 'title';
    span.textContent = t.title;

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.setAttribute('aria-label', `Delete ${t.title}`);
    del.addEventListener('click', () => deleteTodo(t.id));

    li.append(cb, span, del);
    listEl.appendChild(li);
  });
}

formEl.addEventListener('submit', e => {
  e.preventDefault();
  const title = inputEl.value.trim();
  if (!title) return;
  addTodo(title);
  inputEl.value = '';
  inputEl.focus();
});

filterBtns.forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));

render();
