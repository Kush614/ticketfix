// Taskly — minimal todo app.
// State is loaded from the server once, kept in memory, and every change is sent back to the API.
// Rendering is a full re-draw.

let todos = [];
let filter = 'all';

const listEl = document.getElementById('list');
const formEl = document.getElementById('add-form');
const inputEl = document.getElementById('new-todo');
const filterBtns = Array.from(document.querySelectorAll('.filters button'));

const api = (url, method = 'GET', body) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });

async function load() {
  todos = await api('/api/todos').then(r => r.json());
  render();
}

function visibleTodos() {
  if (filter === 'active') return todos.filter(t => !t.done);
  if (filter === 'done') return todos.filter(t => t.done);
  return todos;
}

async function addTodo(title) {
  const todo = await api('/api/todos', 'POST', { title }).then(r => r.json());
  todos.push(todo);
  render();
}

function toggleTodo(id) {
  const t = todos.find(t => t.id === id);
  if (!t) return;
  t.done = !t.done;
  render();
  api(`/api/todos/${id}`, 'PATCH', { done: t.done });
}

function deleteTodo(index) {
  // Remove the todo at this position in the list.
  const [t] = todos.splice(index, 1);
  render();
  api(`/api/todos/${t.id}`, 'DELETE');
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
  items.forEach((t, i) => {
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
    del.addEventListener('click', () => deleteTodo(i));

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

load();
