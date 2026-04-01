const SUPABASE_URL = 'https://ykitplwgpgbidrnrqdan.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hTSlL77g5EE0v9Y-tAjJEA_oSqBfopL';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let goodsData = [];
let tradesData = [];

const $ = (id) => document.getElementById(id);
const show = (id) => $(id)?.classList.remove('hidden');
const hide = (id) => $(id)?.classList.add('hidden');

// --- 認証 ---
async function initAuth() {
    const { data: { session } } = await sb.auth.getSession();
    handleAuthStateChange(session);
    sb.auth.onAuthStateChange((_event, session) => handleAuthStateChange(session));
}

function handleAuthStateChange(session) {
    if (session) {
        currentUser = session.user;
        hide('auth-section'); show('main-app');
        fetchData();
        checkAndMigrateLocalData();
    } else {
        currentUser = null;
        show('auth-section'); hide('main-app');
    }
}

$('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('auth-email').value;
    const password = $('auth-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) $('auth-message').textContent = "ログイン失敗: " + error.message;
};

$('signup-btn').onclick = async () => {
    const email = $('auth-email').value;
    const password = $('auth-password').value;
    const { error } = await sb.auth.signUp({ email, password });
    if (error) $('auth-message').textContent = "登録失敗: " + error.message;
    else $('auth-message').textContent = "アカウントを作成しました。ログインしてください。";
};

$('logout-btn').onclick = () => sb.auth.signOut();

// --- データ取得 ---
async function fetchData() {
    const { data: g } = await sb.from('goods').select('*').order('created_at', { ascending: false });
    const { data: t } = await sb.from('trades').select('*').order('created_at', { ascending: false });
    goodsData = g || [];
    tradesData = t || [];
    renderInventory();
    renderTrades();
    updateTradeItemSelects();
}

// --- 在庫管理 ---
function renderInventory() {
    const list = $('goods-list');
    const q = $('goods-search').value.toLowerCase();
    list.innerHTML = '';
    goodsData.filter(g => g.char.toLowerCase().includes(q) || g.type.toLowerCase().includes(q)).forEach(g => {
        const card = document.createElement('div');
        card.className = 'goods-card';
        card.innerHTML = `
            <div class="goods-info">
                <h4>${g.type}</h4>
                <div class="char-name">${g.char}</div>
            </div>
            <div class="goods-controls">
                <div class="goods-count-group">
                    <button class="count-btn" onclick="updateCount('${g.id}', -1)">-</button>
                    <span class="count-display">${g.count}</span>
                    <button class="count-btn" onclick="updateCount('${g.id}', 1)">+</button>
                </div>
                <div class="card-menu">
                    <button class="nav-btn mini" onclick="editGoods('${g.id}')">集</button>
                    <button class="nav-btn mini cancel-btn" onclick="deleteGoods('${g.id}')">×</button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

async function updateCount(id, delta) {
    const g = goodsData.find(x => x.id === id);
    if (!g) return;
    await sb.from('goods').update({ count: Math.max(0, g.count + delta) }).eq('id', id);
    fetchData();
}

$('add-goods-btn').onclick = () => { $('goods-form').reset(); $('goods-id-edit').value=''; show('goods-modal'); };
$('goods-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('goods-id-edit').value;
    const data = { user_id: currentUser.id, type: $('goods-type').value, char: $('goods-char').value, count: parseInt($('goods-count').value) };
    if (id) await sb.from('goods').update(data).eq('id', id);
    else await sb.from('goods').insert([data]);
    hide('goods-modal'); fetchData();
};

window.editGoods = (id) => {
    const g = goodsData.find(x => x.id === id);
    if (!g) return;
    $('goods-id-edit').value = g.id; $('goods-type').value = g.type; $('goods-char').value = g.char; $('goods-count').value = g.count;
    show('goods-modal');
};

window.deleteGoods = async (id) => { if (confirm('削除しますか？')) { await sb.from('goods').delete().eq('id', id); fetchData(); } };

// --- 取引管理 ---
function updateTradeItemSelects() {
    const options = goodsData.map(g => `<option value="${g.id}">[${g.type}] ${g.char}</option>`).join('');
    ['give-items-list', 'receive-items-list'].forEach(cid => {
        $(cid).innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const row = document.createElement('div'); row.className = 'item-row';
            row.innerHTML = `<select class="item-id"><option value="">--未選択--</option>${options}</select><input type="number" class="item-count" value="1" min="1">`;
            $(cid).appendChild(row);
        }
    });
}

// プレビュー表示
$('trade-address-img').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        $('image-preview').innerHTML = `<img src="${url}">`;
    }
};

$('add-trade-btn').onclick = () => {
    $('trade-form').reset(); $('trade-id').value = ''; $('image-preview').innerHTML = ''; updateTradeItemSelects(); show('trade-modal');
};

$('trade-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('trade-id').value;
    const giveItems = Array.from($('give-items-list').children).map(r => ({ id: r.querySelector('.item-id').value, count: parseInt(r.querySelector('.item-count').value) })).filter(i => i.id);
    const receiveItems = Array.from($('receive-items-list').children).map(r => ({ id: r.querySelector('.item-id').value, count: parseInt(r.querySelector('.item-count').value) })).filter(i => i.id);
    
    const oldTrade = id ? tradesData.find(t => t.id === id) : null;
    const status = $('trade-status').value;
    await syncStock(oldTrade, { status, give_items: giveItems });

    let imageUrl = oldTrade?.image_url || null;
    const file = $('trade-address-img').files[0];
    if (file) {
        const path = `${currentUser.id}/${Date.now()}_${file.name}`;
        const { data } = await sb.storage.from('mailing-images').upload(path, file);
        if (data) { imageUrl = sb.storage.from('mailing-images').getPublicUrl(path).data.publicUrl; }
    }

    const data = {
        user_id: currentUser.id, name: $('trade-name').value, type: $('trade-type').value, status: status,
        memo: $('trade-memo').value, give_items: giveItems, receive_items: receiveItems,
        give_price: parseInt($('trade-give-price').value), receive_price: parseInt($('trade-receive-price').value),
        image_url: imageUrl,
        is_sent: $('trade-is-sent').checked, is_received: $('trade-is-received').checked,
        est_ship_date: $('trade-est-ship-date').value, est_receive_date: $('trade-est-receive-date').value
    };

    if (id) await sb.from('trades').update(data).eq('id', id);
    else await sb.from('trades').insert([data]);
    hide('trade-modal'); fetchData();
};

async function syncStock(oldT, newT) {
    const isReady = (s) => s === '成約';
    // 前が成約以外で、今が成約になった時だけ引く（簡易化）
    if ((!oldT || oldT.status !== '成約') && newT.status === '成約') {
        for (const item of newT.give_items) {
            const g = goodsData.find(x => x.id === item.id);
            if (g) await sb.from('goods').update({ count: Math.max(0, g.count - item.count) }).eq('id', g.id);
        }
    } else if (oldT && oldT.status === '成約' && newT.status !== '成約') {
        for (const item of oldT.give_items) {
            const g = goodsData.find(x => x.id === item.id);
            if (g) await sb.from('goods').update({ count: g.count + item.count }).eq('id', g.id);
        }
    }
}

function renderTrades() {
    const list = $('trades-list');
    const filter = $('status-filter').value;
    list.innerHTML = '';
    tradesData.filter(t => filter === 'all' || t.status === filter).forEach(t => {
        const card = document.createElement('div'); card.className = 'trade-card';
        const giveText = t.give_items.map(i => { const g = goodsData.find(gx => gx.id===i.id); return g ? `${g.char}×${i.count}` : '?'; }).join(', ');
        const receiveText = t.receive_items.map(i => { const g = goodsData.find(gx => gx.id===i.id); return g ? `${g.char}×${i.count}` : '?'; }).join(', ');

        card.innerHTML = `
            <div class="trade-header">
                <div>
                    <span class="trade-user">${t.name}</span>
                    <div class="trade-tags">
                        <label class="tag ${t.is_sent?'done':''}"><input type="checkbox" ${t.is_sent?'checked':''} onchange="quickCheck('${t.id}', 'is_sent', this.checked)"> 発送</label>
                        <label class="tag ${t.is_received?'done':''}"><input type="checkbox" ${t.is_received?'checked':''} onchange="quickCheck('${t.id}', 'is_received', this.checked)"> 受取</label>
                    </div>
                </div>
                <select class="status-quick-change" onchange="quickStatusChange('${t.id}', this.value)">
                    ${['お声掛け中','仮約束','成約'].map(s => `<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="trade-details" style="display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <div>渡: ${giveText || 'なし'}</div>
                    <div>受: ${receiveText || 'なし'}</div>
                    <div class="trade-dates">
                        予定: 🚀${t.est_ship_date || '-'} / 🎁${t.est_receive_date || '-'}
                    </div>
                </div>
                ${t.image_url ? `<img src="${t.image_url}" class="trade-thumb" onclick="showOverlay('${t.image_url}')">` : ''}
            </div>
            ${t.memo ? `<div class="trade-memo-box">${t.memo}</div>` : ''}
            <div class="card-menu">
                <button class="nav-btn mini" onclick="editTrade('${t.id}')">編集</button>
                <button class="nav-btn mini cancel-btn" onclick="deleteTrade('${t.id}')">削除</button>
            </div>
        `;
        list.appendChild(card);
    });
}

window.quickStatusChange = async (id, newS) => {
    const t = tradesData.find(x => x.id === id);
    if (!t) return;
    await syncStock(t, { status: newS, give_items: t.give_items });
    await sb.from('trades').update({ status: newS }).eq('id', id);
    fetchData();
};

window.quickCheck = async (id, field, value) => {
    await sb.from('trades').update({ [field]: value }).eq('id', id);
    fetchData();
};

window.editTrade = (id) => {
    const t = tradesData.find(x => x.id === id);
    if (!t) return;
    $('trade-id').value = t.id; $('trade-name').value = t.name; $('trade-type').value = t.type; $('trade-status').value = t.status;
    $('trade-give-price').value = t.give_price; $('trade-receive-price').value = t.receive_price;
    $('trade-memo').value = t.memo || '';
    $('trade-is-sent').checked = t.is_sent; $('trade-is-received').checked = t.is_received;
    $('trade-est-ship-date').value = t.est_ship_date || ''; $('trade-est-receive-date').value = t.est_receive_date || '';

    updateTradeItemSelects();
    t.give_items.forEach((item, idx) => { if ($('give-items-list').children[idx]) { $('give-items-list').children[idx].querySelector('.item-id').value = item.id; $('give-items-list').children[idx].querySelector('.item-count').value = item.count; } });
    t.receive_items.forEach((item, idx) => { if ($('receive-items-list').children[idx]) { $('receive-items-list').children[idx].querySelector('.item-id').value = item.id; $('receive-items-list').children[idx].querySelector('.item-count').value = item.count; } });

    if (t.image_url) $('image-preview').innerHTML = `<img src="${t.image_url}">`; else $('image-preview').innerHTML = '';
    show('trade-modal');
};

window.deleteTrade = async (id) => {
    if (confirm('削除しますか？')) {
        const t = tradesData.find(x => x.id === id);
        if (t && t.status === '成約') await syncStock(t, { status: 'キャンセル', give_items: [] });
        await sb.from('trades').delete().eq('id', id);
        fetchData();
    }
};

// --- その他UI ---
$('nav-inventory').onclick = () => { show('inventory-section'); hide('trades-section'); $('nav-inventory').classList.add('active'); $('nav-trades').classList.remove('active'); };
$('nav-trades').onclick = () => { hide('inventory-section'); show('trades-section'); $('nav-inventory').classList.remove('active'); $('nav-trades').classList.add('active'); };
document.querySelectorAll('.cancel-btn').forEach(b => b.onclick = () => { hide('goods-modal'); hide('trade-modal'); });
window.showOverlay = (url) => { $('overlay-img').src = url; show('image-overlay'); };
$('image-overlay').onclick = () => hide('image-overlay');
$('goods-search').oninput = renderInventory;
$('status-filter').onchange = renderTrades;

async function checkAndMigrateLocalData() {
    const local = JSON.parse(localStorage.getItem('twst_goods') || '[]');
    if (local.length > 0 && confirm('ローカルデータを同期しますか？')) {
        for (const g of local) { await sb.from('goods').insert([{ user_id: currentUser.id, type: g.type, char: g.char, count: g.count }]); }
        localStorage.removeItem('twst_goods'); fetchData();
    }
}

initAuth();
