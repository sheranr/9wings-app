// Services catalogue and packages (used for bookings and invoice items).
import * as D from '../data.js';
import * as L from '../logic.js';
import { S, isOwner } from '../state.js';
import { $, $$, icon, esc, toast, sheet, closeSheet, empty, eyebrow, topbar, confirmBox } from '../ui.js';

export async function servicesView() {
  let tab = sessionStorage.getItem('nw-svc-tab') || 'services';
  let cat = 'All';
  const render = () => {
    try { sessionStorage.setItem('nw-svc-tab', tab); } catch (e) { /* ignore */ }
    const items = [...S.items].sort((a, b) => a.name.localeCompare(b.name));
    const cats = [...new Set(items.map(i => i.category || 'Other'))].sort();
    $('#main').innerHTML = `${topbar('Services & packages', { back: true })}
    <div class="page wide">
      <div class="page-head"><h2>Services &amp; packages</h2><p>Your decoration services and prices. They appear when you add invoice items and bookings.</p></div>
      <div class="seg" style="margin-bottom:12px"><button class="${tab === 'services' ? 'on' : ''}" data-tab="services">Services · ${items.length}</button><button class="${tab === 'packages' ? 'on' : ''}" data-tab="packages">Packages · ${S.packages.length}</button></div>
      ${tab === 'services' ? `
        <div class="chips">${['All', ...cats].map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        ${items.length ? (cat === 'All' ? cats : [cat]).map(c => `${eyebrow(c)}<div class="svc-grid">${items.filter(i => (i.category || 'Other') === c).map(i => `
          <button class="svc ${i.active === false ? 'off' : ''}" data-svc="${i.id}"><span class="cat">${esc(c)}</span><span class="nm">${esc(i.name)}</span>${i.description ? `<span class="small muted">${esc(i.description)}</span>` : ''}<span class="pr">${Number(i.price) ? L.money(i.price) : '<span class="muted small">Price on request</span>'}</span></button>`).join('')}</div>`).join('')
          : empty('flower', 'No services yet', 'Add the decoration services you offer.', '')}`
      : `${S.packages.length ? `<div class="list">${S.packages.map(p => `<button class="row" data-pkg="${p.id}"><span class="tile-ic gold">${icon('package')}</span><div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${(p.includes || []).map(id => esc(S.items.find(x => x.id === id)?.name || '')).filter(Boolean).join(', ') || esc(p.description || '')}</div></div><div class="end"><b>${p.price ? L.moneyShort(p.price) : '—'}</b></div></button>`).join('')}</div>`
          : empty('package', 'No packages yet', 'Bundle services into packages, e.g. "Classic wedding package".', '')}`}
    </div>
    <button class="fab" id="add" aria-label="Add">${icon('plus')}</button>`;
    $$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    $$('[data-cat]').forEach(b => b.onclick = () => { cat = b.dataset.cat; render(); });
    $$('[data-svc]').forEach(b => b.onclick = () => serviceSheet(S.items.find(i => i.id === b.dataset.svc)));
    $$('[data-pkg]').forEach(b => b.onclick = () => packageSheet(S.packages.find(p => p.id === b.dataset.pkg)));
    $('#add').onclick = () => tab === 'services' ? serviceSheet(null) : packageSheet(null);
  };
  render();
}

function serviceSheet(item) {
  const it = item || { category: 'Wedding', active: true };
  sheet(`<h3>${item ? 'Edit service' : 'New service'}</h3>
    <form id="sf" class="form" autocomplete="off">
      <label class="field"><span>Service name</span><input name="name" required value="${esc(it.name)}"></label>
      <div class="two"><label class="field"><span>Category</span><select name="category">${[...new Set([...L.SERVICE_CATEGORIES, it.category].filter(Boolean))].map(c => `<option ${c === it.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field"><span>Price (LKR)</span><input name="price" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(it.price || '')}" placeholder="0.00"></label></div>
      <label class="field"><span>Description <em>— optional</em></span><textarea name="description" rows="2">${esc(it.description)}</textarea></label>
      <label class="check"><input type="checkbox" name="active" ${it.active !== false ? 'checked' : ''}> Offered (show in bookings and invoices)</label>
      <div class="btns">${item && isOwner() ? `<button type="button" class="btn danger" id="del">${icon('trash')}</button>` : '<button type="button" class="btn secondary" data-close>Cancel</button>'}<button class="btn" type="submit" style="flex:3">Save</button></div>
    </form>`, sh => {
    $('#sf', sh).onsubmit = e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      D.put('items', { ...it, name: f.name.trim(), category: f.category, price: Number(f.price) || 0, description: f.description.trim(), active: !!f.active });
      closeSheet(); toast('Service saved');
    };
    const del = $('#del', sh); if (del) del.onclick = async () => { if (await confirmBox(`Delete "${it.name}"? Existing invoices keep their items.`)) { D.remove('items', it.id); toast('Service deleted'); } };
  });
}

function packageSheet(pkg) {
  const p = pkg || { includes: [] };
  const svcs = [...S.items].filter(i => i.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  sheet(`<h3>${pkg ? 'Edit package' : 'New package'}</h3>
    <form id="pf" class="form" autocomplete="off">
      <label class="field"><span>Package name</span><input name="name" required value="${esc(p.name)}" placeholder="e.g. Classic wedding package"></label>
      <label class="field"><span>Package price (LKR)</span><input name="price" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(p.price || '')}"></label>
      <label class="field"><span>Description <em>— optional</em></span><textarea name="description" rows="2">${esc(p.description)}</textarea></label>
      <div class="label" style="margin:8px 0 6px">Included services</div>
      <div class="list" style="max-height:38vh;overflow:auto">${svcs.map(s => `<label class="row"><input type="checkbox" name="inc" value="${s.id}" ${(p.includes || []).includes(s.id) ? 'checked' : ''} style="width:20px;min-height:20px;accent-color:var(--plum)"><div class="grow t">${esc(s.name)}</div><span class="small muted num">${Number(s.price) ? L.moneyShort(s.price) : ''}</span></label>`).join('')}</div>
      <p class="small muted" id="sumInc"></p>
      <div class="btns">${pkg && isOwner() ? `<button type="button" class="btn danger" id="del">${icon('trash')}</button>` : '<button type="button" class="btn secondary" data-close>Cancel</button>'}<button class="btn" type="submit" style="flex:3">Save</button></div>
    </form>`, sh => {
    const sum = () => { const v = $$('[name=inc]:checked', sh).reduce((a, c) => a + (Number(svcs.find(s => s.id === c.value)?.price) || 0), 0); $('#sumInc', sh).textContent = v ? `Services bought separately: ${L.money(v)}` : ''; };
    $$('[name=inc]', sh).forEach(c => c.onchange = sum); sum();
    $('#pf', sh).onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      D.put('packages', { ...p, name: f.get('name').trim(), price: Number(f.get('price')) || 0, description: (f.get('description') || '').trim(), includes: f.getAll('inc') });
      closeSheet(); toast('Package saved');
    };
    const del = $('#del', sh); if (del) del.onclick = async () => { if (await confirmBox(`Delete "${p.name}"?`)) { D.remove('packages', p.id); toast('Package deleted'); } };
  });
}
