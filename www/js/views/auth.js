// Sign in, first-time owner setup, password reset, no-access screen.
import * as D from '../data.js';
import { $, esc, toast, busy, formData, friendlyError } from '../ui.js';

function frame(inner) {
  document.body.classList.add('bare');
  document.body.innerHTML = `<div class="auth"><div class="box">
    <img class="logo" src="img/logo-full.webp" alt="9Wings Flora & Wedding">
    <p class="slogan">Wings for Dream to Reality.</p>
    <div class="card">${inner}</div>
    <p class="center tiny muted" style="margin-top:18px">9Wings Flora &amp; Wedding · Business app</p>
  </div></div><div id="modal"></div><div id="toast" role="status"></div>`;
}

export async function authView(mode) {
  const A = D.getAdapter();
  if (!mode) {
    frame(`<div class="skel" style="height:220px"></div>`);
    const exists = await A.ownerExists();
    mode = exists === false ? 'setup' : 'login';
  }
  if (mode === 'setup') return setupView();
  frame(`<h2>Welcome back</h2><p class="sub">Sign in to manage bookings, clients and invoices.</p>
    <form id="lf" class="form" autocomplete="on">
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" inputmode="email" required></label>
      <label class="field"><span>Password</span><input name="pw" type="password" autocomplete="current-password" required></label>
      <p class="error hidden" id="err"></p>
      <button class="btn block" type="submit" style="margin-top:8px">Sign in</button>
    </form>
    <div class="center" style="margin-top:10px"><button class="link-btn" id="forgot">Forgot password?</button></div>`);
  $('#lf').onsubmit = e => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.submitter || $('#lf button'), async () => {
      try { await A.signIn(f.email.trim(), f.pw); }
      catch (err) { $('#err').textContent = friendlyError(err); $('#err').classList.remove('hidden'); }
    }, 'Signing in…');
  };
  $('#forgot').onclick = async () => {
    const email = $('#lf [name=email]').value.trim();
    if (!email) { toast('Type your email first, then tap "Forgot password?"'); return; }
    try { await A.resetPassword(email); toast('Password reset email sent to ' + email, 4500); }
    catch (err) { toast(friendlyError(err), 5000); }
  };
}

function setupView() {
  const A = D.getAdapter();
  frame(`<h2>Set up your business</h2><p class="sub">Create the owner account. You can add staff logins afterwards.</p>
    <form id="sf" class="form" autocomplete="on">
      <label class="field"><span>Your name</span><input name="name" required autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="username" inputmode="email"></label>
      <label class="field"><span>Password <em>— at least 8 characters</em></span><input name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
      <label class="field"><span>Confirm password</span><input name="pw2" type="password" minlength="8" required autocomplete="new-password"></label>
      <p class="error hidden" id="err"></p>
      <button class="btn block" type="submit" style="margin-top:8px">Create owner account</button>
    </form>
    <div class="center" style="margin-top:10px"><button class="link-btn" id="haveAcc">I already have an account</button></div>`);
  $('#haveAcc').onclick = () => authView('login');
  $('#sf').onsubmit = e => {
    e.preventDefault();
    const f = formData(e.target);
    const err = m => { $('#err').textContent = m; $('#err').classList.remove('hidden'); };
    if (f.pw !== f.pw2) return err('The passwords don\'t match.');
    busy($('#sf button[type=submit]'), async () => {
      try { await A.createOwner(f.name.trim(), f.email.trim(), f.pw); }
      catch (e2) { err(friendlyError(e2)); }
    }, 'Creating…');
  };
}

export function noAccessView(user, me) {
  const A = D.getAdapter();
  frame(`<h2>${me && me.active === false ? 'Account turned off' : 'No access yet'}</h2>
    <p class="sub">${me && me.active === false
      ? 'Your login has been turned off by the business owner.'
      : `You're signed in as ${esc(user.email)}, but this login hasn't been added to the business. Ask the owner to add you under Team.`}</p>
    <button class="btn secondary block" id="out">Sign out</button>`);
  $('#out').onclick = () => A.signOut();
}
