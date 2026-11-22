import { $ } from '../dom';
import { login } from '../sync';

export function renderLogin(main: HTMLElement): void {
  main.innerHTML = `<div class="card" style="max-width:380px;margin:40px auto">
    <h2>Logga in</h2>
    <form id="loginForm" class="grid" style="gap:10px">
      <input type="email" id="lgEmail" placeholder="E-post" autocomplete="username" required>
      <input type="password" id="lgPass" placeholder="Lösenord" autocomplete="current-password" required>
      <button class="btn primary" id="lgBtn">Logga in</button>
      <div id="lgErr" class="neg" style="font-size:13px"></div>
    </form>
    <p class="muted" style="font-size:12px;margin-bottom:0">Kontot skapas i Supabase (Authentication → Users). Din data sparas i din egen databas och syns bara för dig.</p></div>`;
  const btn = $<HTMLButtonElement>('#lgBtn', main), err = $('#lgErr', main);
  $<HTMLFormElement>('#loginForm', main).onsubmit = async (e) => {
    e.preventDefault();
    btn.disabled = true;
    err.textContent = '';
    const msg = await login($<HTMLInputElement>('#lgEmail', main).value.trim(), $<HTMLInputElement>('#lgPass', main).value);
    btn.disabled = false;
    if (msg) err.textContent = msg;
  };
}
