/* Consensus Bell · interactive prototype
   state → render → one phone, real navigation */
(function () {
  'use strict';

  /* ---------------- state ---------------- */
  const INTERESTS = [
    ['Music', 'assets/in-music.jpg'], ['Travel', 'assets/in-travel.jpg'], ['Photography', 'assets/in-photo.jpg'],
    ['Food', 'assets/in-food.jpg'], ['Reading', 'assets/in-reading.jpg'], ['Movies', 'assets/in-movies.jpg'],
    ['AI', 'assets/in-ai.jpg'], ['Art', 'assets/in-art.jpg'], ['Sports', 'assets/in-sports.jpg'],
  ];
  const freshState = () => ({
    name: 'Luna', gender: 'Female', city: 'Shanghai', age: '20 – 26',
    interests: [], intention: 'Serious relationship',
    statement: '',
    days: 127, memories: 18, bond: 260,
    japan: 200, japanGoal: 1000,
    vows: [
      { t: 'Let’s always communicate, even when it’s hard.', status: 'ok', date: 'Oct 7, 2026' },
      { t: 'Travel to Japan together.', status: 'ok', date: 'Oct 21, 2026', img: 'assets/japan-trip.jpg' },
      { t: 'I choose you, again, in all the ordinary days and all the unexpected ones.', status: 'pending', date: 'Nov 10, 2026', by: 'Alice', hero: true },
      { t: 'Support each other’s dreams.', status: 'ok', date: 'Sep 12, 2026' },
      { t: 'Morning walks together, every Sunday.', status: 'ok', date: 'Oct 12, 2026' },
      { t: 'We save before we spend.', status: 'ok', date: 'Oct 14, 2026' },
      { t: 'No going to bed angry.', status: 'ok', date: 'Sep 20, 2026' },
      { t: 'Learn to say sorry first.', status: 'ok', date: 'Sep 25, 2026' },
    ],
    minted: false, archived: false,
  });
  let S = freshState();

  /* ---------------- wallet auth ---------------- */
  const Wallet = {
    address: null, type: null, // 'injected' | 'demo'
    short() { return this.address ? this.address.slice(0, 6) + '…' + this.address.slice(-4) : ''; },
    async connect() {
      if (window.ethereum && window.ethereum.request) {
        const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
        this.address = accs[0]; this.type = 'injected';
      } else {
        await new Promise(r => setTimeout(r, 900));
        const arr = crypto.getRandomValues(new Uint8Array(20));
        this.address = '0x' + Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
        this.type = 'demo';
      }
      localStorage.setItem('cb_wallet', JSON.stringify({ address: this.address, type: this.type }));
      return this.address;
    },
    restore() {
      try {
        const raw = localStorage.getItem('cb_wallet');
        if (!raw) return false;
        const w = JSON.parse(raw);
        if (!w.address) return false;
        this.address = w.address; this.type = w.type;
        return true;
      } catch (e) { return false; }
    },
    disconnect() {
      this.address = null; this.type = null;
      localStorage.removeItem('cb_wallet');
    },
    async sign(message) {
      if (this.type === 'injected' && window.ethereum) {
        const hex = '0x' + Array.from(new TextEncoder().encode(message), b => b.toString(16).padStart(2, '0')).join('');
        return window.ethereum.request({ method: 'personal_sign', params: [hex, this.address] });
      }
      await new Promise(r => setTimeout(r, 1100));
      const arr = crypto.getRandomValues(new Uint8Array(16));
      return '0x' + Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    },
  };
  Wallet.restore();

  /* signature-gated action: disable button → sign → callback */
  async function requireSign(btn, message, cb, label) {
    if (!Wallet.address) { go('scr-login'); return; }
    const orig = btn.textContent;
    btn.disabled = true;
    btn.style.opacity = .6;
    btn.textContent = 'Signing…';
    try { await Wallet.sign(message); } catch (e) {
      btn.disabled = false; btn.style.opacity = 1; btn.textContent = orig;
      toast('Signature rejected'); return;
    }
    btn.style.opacity = 1;
    btn.textContent = label || 'Signed ✓';
    setTimeout(cb, 420);
  }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const phone = $('#phone');
  const vowCount = () => S.vows.filter(v => v.status === 'ok').length;
  const pendingVow = () => S.vows.find(v => v.status === 'pending') || null;

  /* ---------------- toast ---------------- */
  let toastT;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------------- proof drawer ---------------- */
  function openProof(action) {
    $('#pd-action').textContent = action;
    $('#pd-block').textContent = (8431900 + vowCount() * 32 + S.vows.length).toLocaleString('en-US');
    const pd = $('#pdrawer');
    gsap.killTweensOf('#pdrawer .pc');
    pd.classList.add('on');
    gsap.fromTo('#pdrawer .pc', { y: 70, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .42, ease: 'power3.out', overwrite: true });
  }
  function closeProof() {
    gsap.killTweensOf('#pdrawer .pc');
    gsap.to('#pdrawer .pc', { y: 60, autoAlpha: 0, duration: .28, ease: 'power2.in', overwrite: true,
      onComplete: () => $('#pdrawer').classList.remove('on') });
  }

  /* ---------------- router ---------------- */
  const TAB_ROOTS = ['scr-home', 'scr-story', 'scr-vows', 'scr-bond', 'scr-me'];
  let stack = ['scr-gateway'];
  let current = 'scr-gateway';

  function paint(id, dir) {
    const inEl = document.getElementById(id);
    const outEl = document.getElementById(current);
    if (outEl) {
      outEl.classList.remove('on');
      outEl.classList.toggle('exit-left', dir === 'fwd');
    }
    inEl.classList.add('no-anim');
    inEl.classList.toggle('exit-left', dir !== 'fwd');
    inEl.style.transform = dir === 'fwd' ? 'translateX(7%)' : 'translateX(-7%)';
    inEl.style.opacity = '0';
    void inEl.offsetWidth;
    inEl.classList.remove('no-anim');
    inEl.style.transition = '';
    inEl.classList.add('on');
    inEl.style.transform = '';
    inEl.style.opacity = '';
    inEl.classList.remove('exit-left');
    current = id;
    onEnter(id);
  }
  function go(id) { if (id === current) return; stack.push(id); paint(id, 'fwd'); }
  function back() {
    if (stack.length > 1) { stack.pop(); paint(stack[stack.length - 1], 'back'); }
    else toast('You are at the beginning.');
  }
  function tab(id) {
    stack = [id];
    paint(id, 'tab');
  }
  function resetTo(id) { stack = [id]; paint(id, 'tab'); }

  /* ---------------- per-screen enter hooks ---------------- */
  let creatingTimer, sentTimer;
  function onEnter(id) {
    clearInterval(creatingTimer); clearInterval(sentTimer);
    if (Chain.on()) chainEnter(id);
    if (id === 'scr-creating') {
      creatingTimer = setTimeout(() => { if (current === 'scr-creating') { stack = ['scr-gateway', 'scr-path']; paint('scr-path', 'fwd'); } }, 2400);
    }
    if (id === 'scr-sent' && !Chain.on()) startCountdown();
    if (id === 'scr-sign') {
      const b = $('#sign-go');
      b.disabled = false; b.style.opacity = 1; b.textContent = 'Sign & Accept';
    }
    if (id === 'scr-ceremony') runCeremony();
    if (id === 'scr-vowdetail' && !Chain.on()) renderVowDetail();
    if (id === 'scr-ending' && !Chain.on()) renderEnding();
  }

  function startCountdown() {
    let left = 23 * 3600 + 47 * 60 + 12;
    const el = $('#sent-timer');
    sentTimer = setInterval(() => {
      if (current !== 'scr-sent') { clearInterval(sentTimer); return; }
      left = Math.max(0, left - 1);
      const h = String(Math.floor(left / 3600)).padStart(2, '0');
      const m = String(Math.floor(left % 3600 / 60)).padStart(2, '0');
      const s = String(left % 60).padStart(2, '0');
      el.textContent = h + ':' + m + ':' + s;
    }, 1000);
  }

  /* ---------------- ceremony ---------------- */
  let cerTl;
  function runCeremony() {
    if (cerTl) cerTl.kill();
    const parts = ['.cer-title', '.cer-names', '.cer-line', '.cer-enter'];
    $$('.cer-title,.cer-names,.cer-line,.cer-enter').forEach(el => { el.style.opacity = 0; });
    gsap.set(['#cer-L', '#cer-R'], { x: 0 });
    cerTl = gsap.timeline();
    cerTl
      .fromTo('#cer-L', { x: -46 }, { x: 0, duration: 1.6, ease: 'power2.inOut' })
      .fromTo('#cer-R', { x: 46 }, { x: 0, duration: 1.6, ease: 'power2.inOut' }, '<')
      .to('#cer-L', { x: 1.5, duration: .07, repeat: 5, yoyo: true, ease: 'none' })
      .to('#cer-R', { x: -1.5, duration: .07, repeat: 5, yoyo: true, ease: 'none' }, '<')
      .to('.cer-title', { opacity: 1, duration: .7, ease: 'power2.out' }, '+=0.25')
      .to('.cer-names', { opacity: 1, duration: .6, stagger: .15 }, '-=0.2')
      .to('.cer-line', { opacity: 1, duration: .7 }, '-=0.1')
      .to('.cer-enter', { opacity: 1, duration: .6 }, '-=0.2');
  }

  /* ---------------- renderers ---------------- */
  function bind() {
    $$('[data-b="vows"]').forEach(el => el.textContent = vowCount());
    $$('[data-b="bond"]').forEach(el => el.textContent = S.bond);
    $$('[data-b="memories"]').forEach(el => el.textContent = S.memories);
  }

  function renderVowList() {
    const box = $('#vow-list');
    if (!box) return;
    box.innerHTML = S.vows.map((v, i) => {
      const ok = v.status === 'ok';
      const img = v.img ? '<img src="' + v.img + '" class="w-[52px] h-[52px] rounded-[14px] object-cover shrink-0" alt="">' : '';
      const status = ok
        ? '<div class="flex items-center gap-2 mt-3 text-[12px] text-[#2E9E63]"><span class="w-1.5 h-1.5 rounded-full bg-[#4ECF8B]"></span>Confirmed<span class="text-[#171717]/35">· ' + v.date + '</span><i class="ph-light ph-seal-check text-[14px] ml-auto text-[#4ECF8B]"></i></div>'
        : '<div class="flex items-center gap-2 mt-3 text-[12px] text-[#B8732F]"><span class="w-1.5 h-1.5 rounded-full bg-[#F2A65A]"></span>Pending<span class="text-[#171717]/45">· Waiting for Sophie</span><button class="ml-auto text-[12px] text-[#171717]/55 flex items-center" data-review="' + i + '">Review <i class="ph-light ph-caret-right text-[13px]"></i></button></div>';
      const ring = v.status === 'pending' ? ' ring-1 ring-[#F2A65A]/25' : '';
      return '<div class="card p-5' + ring + '"><div class="flex items-center gap-3"><p class="serif text-[16.5px] leading-relaxed flex-1">“' + v.t + '”</p>' + img + '</div>' + status + '</div>';
    }).join('');
    $$('[data-review]', box).forEach(b => b.addEventListener('click', () => go('scr-vowdetail')));
  }

  function renderVowDetail() {
    const v = pendingVow() || S.vows[S.vows.length - 1];
    const ok = v.status === 'ok';
    $('#vd-quote').textContent = '“' + v.t + '”';
    $('#vd-meta').innerHTML = '<img src="assets/alice.jpg" class="w-[24px] h-[24px] rounded-full object-cover" alt="Alice">' +
      '<p class="text-[13px] text-[#171717]/60">Proposed by ' + (v.by || 'Alice') + '</p>' +
      '<p class="text-[12px] text-[#171717]/40">· ' + v.date + '</p>';
    const btn = $('#vd-confirm'), done = $('#vd-done');
    if (ok) {
      btn.classList.add('hidden');
      done.classList.remove('hidden');
      $('#vd-done-sub').textContent = 'Recorded on BOT Chain · Block #8,431,966';
      $('#vd-status').innerHTML =
        '<span class="chip bg-[#4ECF8B]/12 text-[#2E9E63]"><span class="w-1.5 h-1.5 rounded-full bg-[#4ECF8B]"></span>Confirmed</span>' +
        '<div class="flex items-center ml-1"><img src="assets/alice.jpg" class="w-[22px] h-[22px] rounded-full object-cover border-2 border-white" alt="Alice">' +
        '<img src="assets/sophie.jpg" class="w-[22px] h-[22px] rounded-full object-cover border-2 border-white -ml-1.5" alt="Sophie"></div>' +
        '<p class="text-[12px] text-[#171717]/45">' + v.date + '</p>' +
        '<button class="ml-auto text-[12px] text-[#2E9E63] flex items-center gap-1" data-proof="Vow Confirmed"><i class="ph-light ph-seal-check text-[14px]"></i>View Proof</button>';
    } else {
      btn.classList.remove('hidden');
      done.classList.add('hidden');
      $('#vd-status').innerHTML =
        '<span class="chip bg-[#F2A65A]/15 text-[#B8732F]"><span class="w-1.5 h-1.5 rounded-full bg-[#F2A65A]"></span>Pending Confirmation</span>' +
        '<div class="flex items-center ml-1"><img src="assets/alice.jpg" class="w-[22px] h-[22px] rounded-full object-cover border-2 border-white" alt="Alice">' +
        '<img src="assets/sophie.jpg" class="w-[22px] h-[22px] rounded-full object-cover border-2 border-white -ml-1.5 opacity-40 grayscale" alt="Sophie"></div>' +
        '<p class="text-[12px] text-[#171717]/45">Waiting for you</p>' +
        '<button class="ml-auto text-[12px] text-[#2E9E63] flex items-center gap-1" data-proof="Vow Proposed"><i class="ph-light ph-seal-check text-[14px]"></i>View Proof</button>';
    }
  }

  function confirmVow() {
    const v = pendingVow();
    if (!v) return;
    v.status = 'ok';
    v.date = 'Nov 10, 2026';
    bind();
    renderVowList();
    renderVowDetail();
    updatePendingUI();
    $('#vd-done-sub').textContent = 'Vow #' + vowCount() + ' · Recorded on BOT Chain · Block #8,431,966';
    gsap.fromTo('#vd-done', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: .5, ease: 'power3.out' });
    gsap.fromTo('.vd-pulse', { attr: { r: 10 }, opacity: .9 }, { attr: { r: 48 }, opacity: 0, duration: 1.8, repeat: 3, ease: 'power1.out' });
    const c = $('[data-b="vows"]');
    if (c) gsap.fromTo(c, { scale: 1.35, color: '#2E9E63' }, { scale: 1, color: '#171717', duration: .8, ease: 'power2.out' });
    toast('Vow #' + vowCount() + ' · both signatures on chain');
  }

  function updatePendingUI() {
    const has = !!pendingVow();
    $('#home-pending').style.display = has ? 'flex' : 'none';
    $('#home-sep').style.display = has ? 'block' : 'none';
    $('#home-pulse').style.display = has ? 'block' : 'none';
  }

  function renderBond() {
    $('#jp-amt').textContent = S.japan.toLocaleString('en-US');
    $('#jp-bar').style.width = Math.min(100, S.japan / S.japanGoal * 100) + '%';
  }

  /* ---------------- personalization: registration data flows everywhere ---------------- */
  const SOPHIE = { name: 'Sophie', interests: ['Travel', 'Music', 'Photography'], intention: 'Serious relationship' };
  function renderPersonalization() {
    const me = S;
    $('#hm-names').innerHTML = me.name + ' <span class="text-[#E98F93]">×</span> ' + SOPHIE.name;
    $('#cer-names').textContent = me.name + ' × ' + SOPHIE.name;
    $('#rcv-name').textContent = me.name;
    $('#me-name').textContent = me.name;
    $('#me-meta').textContent = me.city + ' · ' + me.age + ' · ' + me.intention;
    $('#me-participants').textContent = me.name + ' · ' + SOPHIE.name;
    $('#me-wallet').innerHTML = '<i class="ph-light ph-wallet text-[13px] text-[#2E9E63]"></i><span class="truncate">' +
      (Wallet.short() || 'no wallet') + '</span><span class="text-[#171717]/35">' + (Wallet.type === 'injected' ? '· injected' : Wallet.address ? '· demo' : '') + '</span>';
    $('#sign-as').innerHTML = '<i class="ph-light ph-wallet text-[14px] text-[#2E9E63]"></i>Signing as ' +
      (Wallet.short() ? '<span class="font-medium text-[#171717]/70">' + Wallet.short() + '</span>' : '…') +
      '<span class="text-[#171717]/35">· BOT Chain</span>';
    // discover: real overlap with Sophie
    const shared = me.interests.filter(i => SOPHIE.interests.includes(i));
    $('#dc-shared').textContent = shared.length;
    const intentChip = $('#dc-intent');
    if (me.intention === SOPHIE.intention) {
      intentChip.innerHTML = '<i class="ph-light ph-check-circle text-[12px]"></i>Same intention';
      intentChip.style.display = '';
    } else {
      intentChip.style.display = 'none';
    }
  }

  function renderEnding() {
    const req = $('#end-request');
    if (S.archived) {
      req.textContent = 'Archived · Oct 7, 2026';
      req.style.background = 'rgba(23,23,23,.08)';
      req.style.color = 'rgba(23,23,23,.5)';
      req.disabled = true;
      req.style.cursor = 'default';
    } else {
      req.textContent = 'Request End';
      req.style.background = '#C0646A';
      req.style.color = '#fff';
      req.disabled = false;
    }
  }

  function archiveRing() {
    S.archived = true;
    phone.classList.add('archived');
    const st = $('#me-status');
    st.className = 'chip bg-[#171717]/[0.06] text-[#171717]/50';
    st.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#B9B3AE]"></span>Archived';
    updatePendingUI();
    renderEnding();
    closeSheet('end');
    toast('Some things end. That doesn’t mean they never existed.');
    setTimeout(() => resetTo('scr-home'), 900);
  }

  /* ---------------- sheets ---------------- */
  function openSheet(name) {
    $('#' + name + '-ov').classList.add('on');
    $('#' + name + '-sheet').classList.add('on');
  }
  function closeSheet(name) {
    $('#' + name + '-ov').classList.remove('on');
    $('#' + name + '-sheet').classList.remove('on');
  }

  /* ---------------- identity: interests ---------------- */
  function renderInterests() {
    const grid = $('#int-grid');
    grid.innerHTML = INTERESTS.map(([name, img]) =>
      '<button class="icard h-[92px]" data-int="' + name + '">' +
      '<img src="' + img + '" alt="' + name + '">' +
      '<span class="lb">' + name + '</span><span class="ck">✓</span></button>'
    ).join('');
    $$('.icard', grid).forEach(c => c.addEventListener('click', () => {
      const name = c.getAttribute('data-int');
      if (c.classList.contains('sel')) {
        c.classList.remove('sel');
        S.interests = S.interests.filter(x => x !== name);
      } else {
        if (S.interests.length >= 8) { toast('Up to 8 — keep it curated.'); return; }
        c.classList.add('sel');
        S.interests.push(name);
      }
      $('#int-count').textContent = S.interests.length;
    }));
  }

  /* ---------------- wire global clicks ---------------- */
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { go(nav.getAttribute('data-nav')); return; }
    if (e.target.closest('[data-back]')) { back(); return; }
    const tb = e.target.closest('[data-tab]');
    if (tb) { tab(tb.getAttribute('data-tab')); return; }
    const pf = e.target.closest('[data-proof]');
    if (pf) { openProof(pf.getAttribute('data-proof')); return; }
    const tt = e.target.closest('[data-toast]');
    if (tt) { toast(tt.getAttribute('data-toast')); return; }
    if (e.target.closest('#pd-ov') || e.target.closest('.pdrawer')) {
      if (!e.target.closest('[data-toast]')) closeProof();
    }
  });

  /* ---------------- wire ids ---------------- */
  function wire() {
    // login
    async function finishLogin(addr, injected) {
      $('#login-note').innerHTML = 'Connected · <span class="text-[#171717]/60">' + Wallet.short() + '</span> · ' + (injected ? 'injected wallet' : 'embedded demo wallet');
      $('#login-net').textContent = 'BOT Chain · Chain ID 677';
      $('#login-btn').textContent = 'Signed in ✓';
      $('#login-btn').style.background = '#2E9E63';
      renderPersonalization();
      setTimeout(() => {
        $('#login-btn').textContent = 'Connect Wallet';
        $('#login-btn').style.background = '';
        go('scr-id1');
        toast('Welcome, ' + (S.name || 'friend'));
      }, 900);
    }
    if (Chain.on()) {
      const enter = async () => {
        try {
          const addr = await Chain.connect();
          $('#login-note').innerHTML = 'Connected · <span class="text-[#171717]/60">' + Chain.short() + '</span> · ' + (Chain.anvil ? 'anvil rehearsal' : 'MetaMask');
          $('#login-net').textContent = CFG.chainName + ' · Chain ID ' + CFG.chainId;
          $('#login-btn').textContent = 'Signed in ✓';
          $('#login-btn').style.background = '#2E9E63';
          setTimeout(() => {
            $('#login-btn').textContent = 'Connect Wallet';
            $('#login-btn').style.background = '';
            go('scr-id1');
            toast('Wallet ' + Chain.short() + ' · ' + CFG.chainName);
          }, 800);
        } catch (e) {
          $('#login-btn').textContent = 'Connect Wallet';
          $('#login-btn').style.opacity = 1;
          toast(e.message || 'wallet connection failed');
        }
      };
      $('#login-btn').addEventListener('click', async function () {
        this.textContent = 'Waiting for wallet…';
        this.style.opacity = .6;
        this.style.opacity = 1;
        await enter();
      });
      $('#login-demo').addEventListener('click', enter);
    } else {
    $('#login-btn').addEventListener('click', async function () {
      if (Wallet.address) { finishLogin(Wallet.address, Wallet.type === 'injected'); return; }
      this.textContent = 'Waiting for wallet…';
      this.style.opacity = .6;
      try { await Wallet.connect(); } catch (e) {
        this.textContent = 'Connect Wallet'; this.style.opacity = 1;
        toast('Connection cancelled'); return;
      }
      this.style.opacity = 1;
      finishLogin(Wallet.address, Wallet.type === 'injected');
    });
    $('#login-demo').addEventListener('click', async function () {
      if (!Wallet.address) { await Wallet.connect(); }
      finishLogin(Wallet.address, false);
    });
    }

    // identity: capture real inputs on create
    $('#scr-id4 [data-nav="scr-creating"]').addEventListener('click', () => {
      S.name = $('#in-name').value.trim() || 'Luna';
      S.gender = $('#in-gender').value;
      S.city = $('#in-city').value.trim() || 'Somewhere';
      S.age = $('#in-age').value;
      S.intention = $('#intention-list .rcard.sel')?.getAttribute('data-int') || S.intention;
      S.statement = $('#in-statement').value.trim();
      renderPersonalization();
    });

    // identity
    $('#in-statement').addEventListener('input', e => { $('#st-count').textContent = e.target.value.length; });
    $$('#intention-list .rcard').forEach(c => c.addEventListener('click', () => {
      $$('#intention-list .rcard').forEach(x => x.classList.remove('sel'));
      c.classList.add('sel');
      S.intention = c.getAttribute('data-int');
    }));
    $('#inv-send').addEventListener('click', () => {
      gsap.fromTo('#inv-R', { opacity: .3 }, { opacity: 1, duration: .8, yoyo: true, repeat: 1 });
      go('scr-sent');
      toast('Invitation created on BOT Chain');
    });
    $('#sign-go').addEventListener('click', function () {
      requireSign(this, 'Accept Ring invitation #1024 · ' + S.name + ' × ' + SOPHIE.name, () => {
        go('scr-ceremony');
      }, 'Signed ✓');
    });
    $('#cer-enter').addEventListener('click', () => { resetTo('scr-home'); toast('Day 127 · Welcome home'); });

    // vows
    $('#vow-new').addEventListener('click', () => openSheet('vow'));
    $('#vow-cancel').addEventListener('click', () => closeSheet('vow'));
    $('#vow-ov').addEventListener('click', () => closeSheet('vow'));
    $('#vow-propose').addEventListener('click', () => {
      const t = $('#vow-draft').value.trim();
      if (!t) { toast('Write something true.'); return; }
      S.vows.push({ t: t, status: 'pending', date: 'Nov 10, 2026', by: 'You' });
      renderVowList();
      closeSheet('vow');
      $('#vow-draft').value = '';
      toast('Vow proposed · waiting for Sophie');
    });
    $('#vd-confirm').addEventListener('click', confirmVow);

    // bond
    $('#bond-deposit').addEventListener('click', () => openSheet('bond'));
    $('#bond-cancel').addEventListener('click', () => closeSheet('bond'));
    $('#bond-ov').addEventListener('click', () => closeSheet('bond'));
    $$('#bond-amts .fchip').forEach(c => c.addEventListener('click', () => {
      $$('#bond-amts .fchip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
    }));
    $('#bond-confirm').addEventListener('click', function () {
      const amt = parseInt($('#bond-amts .fchip.on').getAttribute('data-amt'), 10);
      requireSign(this, 'Deposit ' + amt + ' BOT · Japan Trip', () => {
        S.bond += amt; S.japan += amt;
        bind(); renderBond();
        closeSheet('bond');
        this.textContent = 'Deposit'; this.disabled = false;
        toast('Signed · Deposited ' + amt + ' BOT · Japan Trip ' + S.japan + '/' + S.japanGoal.toLocaleString('en-US'));
        gsap.fromTo('#hm-ringimg', { scale: 1.04 }, { scale: 1, duration: .9, ease: 'power2.out' });
      });
    });

    // vault
    $('#vault-info').addEventListener('click', () => $('#vault-tech').classList.toggle('hidden'));

    // witness detail
    $('#mat-label').textContent = 'Rose Gold';
    $$('#mats .mat').forEach(m => m.addEventListener('click', () => {
      $$('#mats .mat').forEach(x => x.classList.remove('on'));
      m.classList.add('on');
      $('#mat-label').textContent = m.getAttribute('data-mat');
      const filters = { 'Rose Gold': 'none', 'Silver': 'saturate(0) brightness(1.12)', 'White Gold': 'saturate(.35) brightness(1.22)', 'Black Titanium': 'saturate(.2) brightness(.5) contrast(1.15)' };
      $('#wd-ringimg').style.filter = filters[m.getAttribute('data-mat')] || 'none';
    }));
    $('#mint-btn').addEventListener('click', function () {
      if (S.minted) { openProof('Witness Minted'); return; }
      requireSign(this, 'Mint Witness #431 · fee 2.0 BOT', () => {
        S.minted = true;
        this.textContent = 'Minted · Witness #431 ✓';
        this.style.background = '#2E9E63';
        toast('Witness #431 is yours · mirror copies to both wallets');
        openProof('Witness Minted');
      }, 'Minted ✓');
    });

    // ending
    $('#end-request').addEventListener('click', function () { if (!S.archived) openSheet('end'); });
    $('#end-cancel').addEventListener('click', () => closeSheet('end'));
    $('#end-ov').addEventListener('click', () => closeSheet('end'));
    $('#end-sophie').addEventListener('click', function () {
      requireSign(this, 'Request End · Relation #1024', () => {
        this.textContent = 'Request End'; this.disabled = false;
        archiveRing();
      }, 'Confirmed ✓');
    });
    // me: switch wallet
    $('#me-switch').addEventListener('click', () => {
      Wallet.disconnect();
      toast('Wallet disconnected');
      resetTo('scr-login');
    });

    // story filters
    $$('#story-filters .fchip').forEach(c => c.addEventListener('click', () => {
      $$('#story-filters .fchip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      const f = c.getAttribute('data-f');
      $$('#scr-story .ev').forEach(ev => { ev.style.display = (f === 'all' || ev.getAttribute('data-t') === f) ? '' : 'none'; });
    }));

    // reset demo
    $('#reset-demo').addEventListener('click', () => {
      S = freshState();
      phone.classList.remove('archived');
      const st = $('#me-status');
      st.className = 'chip bg-[#4ECF8B]/12 text-[#2E9E63]';
      st.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#4ECF8B]"></span>Active';
      const mint = $('#mint-btn');
      mint.textContent = 'Mint Digital Ring';
      mint.style.background = '';
      mint.style.opacity = 1;
      $('#wd-ringimg').style.filter = 'none';
      $$('#mats .mat').forEach((x, i) => x.classList.toggle('on', i === 0));
      $('#mat-label').textContent = 'Rose Gold';
      $('#int-count').textContent = '0';
      renderInterests(); renderVowList(); renderBond(); bind(); updatePendingUI(); renderEnding(); renderPersonalization();
      resetTo('scr-gateway');
    });
  }

  /* ---------------- ambient animations ---------------- */
  function ambient() {
    gsap.to('#g-orbit', { rotation: 360, duration: 26, repeat: -1, ease: 'none', svgOrigin: '190 190' });
    gsap.to('#hm-orbit', { rotation: 360, duration: 30, repeat: -1, ease: 'none', svgOrigin: '132 132' });
    gsap.to('#wd-orbit', { rotation: 360, duration: 30, repeat: -1, ease: 'none', svgOrigin: '110 110' });
    gsap.to('#g-ringimg', { y: -10, duration: 3.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('#hm-ringimg', { y: -8, duration: 3.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('#wd-ringimg', { y: -7, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('#inv-L', { x: -8, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('#inv-R', { x: 8, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('#sign-R', { opacity: .55, duration: 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('#sent-ghost', { strokeDashoffset: -64, duration: 6, repeat: -1, ease: 'none' });
    gsap.to('#cr-spin', { rotation: 360, duration: 2.2, repeat: -1, ease: 'none', svgOrigin: '60 60' });
    gsap.to('.star', { opacity: .25, duration: 2, repeat: -1, yoyo: true, stagger: .4, ease: 'sine.inOut' });
  }

  /* ---------------- chain mode (real transactions) ---------------- */
  const CFGC = window.CB_CONFIG || {};
  function rebind(sel, handler) {
    const el = $(sel);
    if (!el) return;
    const clone = el.cloneNode(true);
    el.replaceWith(clone);
    clone.addEventListener('click', handler);
    return clone;
  }
  function peerShort() {
    const p = Chain.peerAddress();
    return p ? p.slice(0, 6) + '…' + p.slice(-4) : '';
  }
  function fmtDays(ts) { return Math.max(0, Math.floor((Date.now() / 1000 - ts) / 86400)); }
  function setTxLine(sel, hash) {
    const el = $(sel);
    if (!el) return;
    const url = Chain.explorerTx(hash);
    el.classList.remove('hidden');
    el.innerHTML = url
      ? 'tx <a class="underline" href="' + url + '" target="_blank" rel="noopener">' + hash.slice(0, 10) + '…' + hash.slice(-6) + '</a>'
      : 'tx ' + hash.slice(0, 18) + '…';
  }

  let chainTimer;
  async function chainHomeSync() {
    try {
      const r = await Chain.myRelation();
      if (!r.id) return;
      $('#hm-names').innerHTML = S.name + ' <span class="text-[#E98F93]">×</span> ' + (peerShort() || SOPHIE.name);
      const daysEl = document.querySelector('#scr-home .serif.text-\\[42px\\]');
      if (daysEl) daysEl.textContent = fmtDays(r.createdAt);
      $('[data-b="vows"]').textContent = r.vowCount;
      $('[data-b="memories"]').textContent = S.memories;
      const bond = await Chain.bondSum(r.id);
      $('[data-b="bond"]').textContent = Math.round(bond);
      // pending-for-me vow card
      const vows = await Chain.vows(r.id);
      const forMe = vows.find(v => !v.confirmed && v.proposer.toLowerCase() !== Chain.address.toLowerCase());
      const pend = document.getElementById('home-pending');
      if (forMe) {
        pend.style.display = 'flex';
        $('#home-sep').style.display = 'block';
        $('#home-pulse').style.display = 'block';
      } else {
        pend.style.display = 'none';
        $('#home-sep').style.display = 'none';
        $('#home-pulse').style.display = 'none';
      }
      if (r.status === 2) { phone.classList.add('archived'); }
      if (r.status === 1) {
        const st = $('#me-status');
        st.className = 'chip bg-[#F2A65A]/15 text-[#B8732F]';
        st.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#F2A65A]"></span>Ending';
      } else if (r.status === 0) {
        const st = $('#me-status');
        st.className = 'chip bg-[#4ECF8B]/12 text-[#2E9E63]';
        st.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#4ECF8B]"></span>Active';
      }
    } catch (e) { /* rpc hiccup: keep last state */ }
  }

  async function chainVowList() {
    try {
      const r = await Chain.myRelation();
      if (!r.id) return;
      const vows = await Chain.vows(r.id);
      const me = Chain.address.toLowerCase();
      const box = $('#vow-list');
      box.innerHTML = vows.length ? '' : '<div class="flat p-6 text-center text-[13px] text-[#171717]/45">No vows yet — propose the first one together.</div>';
      [...vows].reverse().forEach(v => {
        const mine = v.proposer.toLowerCase() === me;
        const ok = v.confirmed;
        const status = ok
          ? '<div class="flex items-center gap-2 mt-3 text-[12px] text-[#2E9E63]"><span class="w-1.5 h-1.5 rounded-full bg-[#4ECF8B]"></span>Confirmed<span class="text-[#171717]/35">· on chain</span><i class="ph-light ph-seal-check text-[14px] ml-auto text-[#4ECF8B]"></i></div>'
          : '<div class="flex items-center gap-2 mt-3 text-[12px] text-[#B8732F]"><span class="w-1.5 h-1.5 rounded-full bg-[#F2A65A]"></span>Pending<span class="text-[#171717]/45">· ' + (mine ? 'waiting for ' + (peerShort() || 'partner') : 'waiting for you') + '</span>' + (mine ? '' : '<button class="ml-auto text-[12px] text-[#171717]/55" data-cconfirm="' + v.idx + '">Review</button>') + '</div>';
        box.innerHTML += '<div class="card p-5"><div class="flex items-center gap-3"><p class="serif text-[16.5px] leading-relaxed flex-1">“' + v.text + '”</p></div>' + status + '</div>';
      });
      $$('[data-cconfirm]', box).forEach(b => b.addEventListener('click', () => { window.__chainConfirmIdx = b.getAttribute('data-cconfirm'); go('scr-vowdetail'); }));
    } catch (e) {}
  }

  async function chainVowDetail() {
    const r = await Chain.myRelation();
    if (!r.id) return;
    const vows = await Chain.vows(r.id);
    const me = Chain.address.toLowerCase();
    const v = vows.find(x => !x.confirmed && x.proposer.toLowerCase() !== me) || vows[vows.length - 1];
    if (!v) return;
        window.__chainConfirmIdx = v.idx;
    $('#vd-quote').textContent = '“' + v.text + '”';
    const mine = v.proposer.toLowerCase() === me;
    $('#vd-meta').innerHTML = '<img src="assets/' + (mine ? 'alice.jpg' : 'sophie.jpg') + '" class="w-[24px] h-[24px] rounded-full object-cover" alt="">'
      + '<p class="text-[13px] text-[#171717]/60">Proposed by ' + (mine ? 'you' : (peerShort() || 'partner')) + '</p>'
      + '<p class="text-[12px] text-[#171717]/40">· block time ' + new Date(v.proposedAt * 1000).toLocaleString() + '</p>';
    const btn = $('#vd-confirm'), done = $('#vd-done');
    if (v.confirmed) {
      btn.classList.add('hidden'); done.classList.remove('hidden');
      $('#vd-status').innerHTML = '<span class="chip bg-[#4ECF8B]/12 text-[#2E9E63]"><span class="w-1.5 h-1.5 rounded-full bg-[#4ECF8B]"></span>Confirmed on chain</span>';
      setTxLine('#vd-done-sub', Chain.lastTx['confirmVow'] || '');
    } else if (mine) {
      btn.classList.add('hidden'); done.classList.add('hidden');
      $('#vd-status').innerHTML = '<span class="chip bg-[#F2A65A]/15 text-[#B8732F]"><span class="w-1.5 h-1.5 rounded-full bg-[#F2A65A]"></span>Pending · ' + (peerShort() || 'partner') + ' must confirm</span>';
    } else {
      btn.classList.remove('hidden'); done.classList.add('hidden');
      btn.textContent = 'Confirm';
      $('#vd-status').innerHTML = '<span class="chip bg-[#F2A65A]/15 text-[#B8732F]"><span class="w-1.5 h-1.5 rounded-full bg-[#F2A65A]"></span>Pending Confirmation</span><p class="text-[12px] text-[#171717]/45">Your signature makes it real</p>';
    }
  }

  async function chainEnter(id) {
    clearInterval(chainTimer);
    if (id === 'scr-path') {
      try {
        const rel = await Chain.myRelation();
        if (rel.id) { resetTo('scr-home'); toast('Welcome back · Day ' + Math.max(0, Math.floor((Date.now() / 1000 - rel.createdAt) / 86400))); return; }
        const inv = await Chain.pendingInviterFor(Chain.address);
        if (inv && inv !== ethers.ZeroAddress) { window.__chainInviter = inv; stack = ['scr-gateway', 'scr-received']; paint('scr-received', 'fwd'); }
      } catch (e) {}
    }
    if (id === 'scr-received') {
      const inv = window.__chainInviter;
      if (inv) $('#rcv-name').textContent = inv.slice(0, 6) + '…' + inv.slice(-4);
    }
    if (id === 'scr-home') {
      chainHomeSync();
      chainTimer = setInterval(chainHomeSync, 4000);
    }
    if (id === 'scr-vows') chainVowList();
    if (id === 'scr-vowdetail') chainVowDetail();
    if (id === 'scr-sent' && Chain.lastTx['createInvitation']) {
      setTxLine('#sent-tx', Chain.lastTx['createInvitation']);
      const sw = document.getElementById('sent-switchline');
      if (sw) sw.style.display = 'none';
    }
    if (id === 'scr-ending') {
      chainEndingState();
      clearInterval(chainTimer);
      chainTimer = setInterval(chainEndingState, 3000); // keep end-state fresh across windows
    }
  }

  async function chainEndingState() {
    let r;
    try { r = await Chain.myRelation(); } catch (e) { return; }
    const req = $('#end-request');
    if (r.status === 2) {
      req.textContent = 'Archived · withdraw your bond';
      req.style.background = 'rgba(23,23,23,.08)';
      req.style.color = 'rgba(23,23,23,.5)';
      rebind('#end-request', async function () {
        this.disabled = true;
        this.textContent = 'Signing…';
        try {
          await Chain.send('withdrawFrom', [r.id]);
          toast('Bond withdrawn · it was always yours');
        } catch (e) { toast('tx failed: ' + (e.reason || e.message || '').slice(0, 60)); this.disabled = false; }
      });
    } else if (r.status === 1) {
      req.textContent = 'Confirm End';
      req.style.background = '#C0646A';
      req.style.color = '#fff';
      rebind('#end-request', async function () {
        this.textContent = 'Signing…';
        try {
          await Chain.send('confirmEnd', []);
          this.textContent = 'Archived ✓';
          phone.classList.add('archived');
          toast('Some things end. That doesn’t mean they never existed.');
          setTimeout(() => resetTo('scr-home'), 1200);
        } catch (e) { this.textContent = 'Confirm End'; toast('tx failed: ' + (e.reason || e.message || '').slice(0, 60)); }
      });
    } else {
      req.textContent = 'Request End';
      req.style.background = '#C0646A';
      req.style.color = '#fff';
      rebind('#end-request', async function () {
        this.textContent = 'Signing…';
        try {
          await Chain.send('requestEnd', []);
          this.textContent = 'Requested ✓';
          toast('End requested · partner confirms or 7 days pass');
          setTimeout(() => resetTo('scr-me'), 1000);
        } catch (e) { this.textContent = 'Request End'; toast('tx failed: ' + (e.reason || e.message || '').slice(0, 60)); }
      });
    }
  }

  function chainWire() {
    // Send Invitation -> real createInvitation
    rebind('#inv-send', async function () {
      const peer = Chain.peerAddress();
      if (!peer) { toast('Sophie address missing (chain-config)'); return; }
      this.textContent = 'Waiting for wallet…';
      try {
        const h = await Chain.send('createInvitation', [peer]);
        this.textContent = 'Send Invitation';
        setTxLine('#inv-tx', h);
        go('scr-sent');
        toast('Invitation on chain · ' + Chain.short());
      } catch (e) { this.textContent = 'Send Invitation'; toast('tx failed: ' + (e.reason || e.message || '').slice(0, 60)); }
    });
    // Sign & Accept -> acceptInvitation
    rebind('#sign-go', async function () {
      this.textContent = 'Waiting for wallet…';
      try {
        const h = await Chain.send('acceptInvitation', []);
        this.textContent = 'Signed ✓';
        Chain.lastTx['acceptInvitation'] = h;
        go('scr-ceremony');
      } catch (e) { this.textContent = 'Sign & Accept'; toast('tx failed: ' + (e.reason || e.message || '').slice(0, 60)); }
    });
    // propose vow
    rebind('#vow-propose', async function () {
      const t = $('#vow-draft').value.trim();
      if (!t) { toast('Write something true.'); return; }
      this.textContent = 'Signing…';
      try {
        await Chain.send('proposeVow', [t]);
        closeSheet('vow'); $('#vow-draft').value = '';
        this.textContent = 'Propose Vow';
        toast('Vow proposed on chain');
        chainVowList();
      } catch (e) { this.textContent = 'Propose Vow'; toast('tx failed: ' + (e.reason || e.message || '').slice(0, 60)); }
    });
    // confirm vow
    rebind('#vd-confirm', async function () {
      const idx = window.__chainConfirmIdx;
      if (idx === undefined) return;
      this.textContent = 'Signing…';
      try {
        await Chain.send('confirmVow', [Number(idx)]);
        await chainVowDetail();
        bind();
        gsap.fromTo('.vd-pulse', { attr: { r: 10 }, opacity: .9 }, { attr: { r: 48 }, opacity: 0, duration: 1.8, repeat: 3, ease: 'power1.out' });
        toast('Vow confirmed · count +1 on chain');
      } catch (e) { this.textContent = 'Confirm'; toast('tx failed: ' + (e.reason || e.message || '').slice(0, 60)); }
    });
    // deposit
    rebind('#bond-confirm', async function () {
      const amt = parseInt($('#bond-amts .fchip.on').getAttribute('data-amt'), 10);
      this.textContent = 'Waiting for wallet…';
      try {
        const h = await Chain.send('deposit', [], ethers.parseEther(String(amt)));
        closeSheet('bond');
        this.textContent = 'Deposit';
        toast('Deposited ' + amt + ' BOT on chain');
        chainHomeSync();
      } catch (e) { this.textContent = 'Deposit'; toast('tx failed: ' + (e.reason || e.message || '').slice(0, 60)); }
    });
    // ending screen gets chain-aware handlers in chainEndingState()
    // proof drawer explorer button opens the real latest tx when available
    rebind('.pdrawer [data-toast]', function () {
      const hash = Chain.lastTx['acceptInvitation'] || Chain.lastTx['createInvitation'] || Object.values(Chain.lastTx)[0];
      const url = hash && Chain.explorerTx(hash);
      if (url) window.open(url, '_blank');
      else toast('Opening BOT Chain explorer…');
    });
  }


  renderVowList();
  renderBond();
  bind();
  updatePendingUI();
  renderEnding();
  renderPersonalization();
  wire();
  if (Chain.on()) chainWire();
  ambient();
  document.getElementById('scr-gateway').classList.add('on');
  if (Wallet.address) {
    $('#login-note').innerHTML = 'Welcome back · <span class="text-[#171717]/60">' + Wallet.short() + '</span> · ' + (Wallet.type === 'injected' ? 'injected wallet' : 'embedded demo wallet');
    $('#login-btn').textContent = 'Continue as ' + Wallet.short();
  }
  // load veil: hide once tailwind + fonts + first paint are ready
  function hideVeil() { const v = $('#veil'); if (v) v.classList.add('off'); }
  if (document.readyState === 'complete') {
    Promise.all([document.fonts.ready, new Promise(r => setTimeout(r, 500))]).then(hideVeil);
  } else {
    window.addEventListener('load', () => Promise.all([document.fonts.ready, new Promise(r => setTimeout(r, 500))]).then(hideVeil));
  }
  setTimeout(hideVeil, 4500); // failsafe
})();
