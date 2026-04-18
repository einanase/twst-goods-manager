const SUPABASE_URL = 'https://ykitplwgpgbidrnrqdan.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hTSlL77g5EE0v9Y-tAjJEA_oSqBfopL';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let goodsData = [];
let tradesData = [];
let isRecovering = false;
let currentInventoryView = localStorage.getItem('twst_inventory_view') || 'list';

// アプリバージョン
const APP_VERSION = '1.2 (Defensive Sync Fix)';
console.log(`%ctwst-goods-manager ${APP_VERSION}`, 'color: #d4af37; font-weight: bold; font-size: 1.2rem;');

// グローバルエラーハンドリング（どこかで失敗したら即通知）
window.addEventListener('unhandledrejection', event => {
    const errorMsg = event.reason?.message || event.reason;
    console.error('Unhandled rejection:', event.reason);
    alert('通信エラーまたはプログラムエラーが発生しました。ページを読み込み直してください。\n理由：' + errorMsg);
});

// 通常のエラーもキャッチ
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Window Error:', msg, error);
    alert('エラーが発生しました：' + msg);
    return false;
};

const $ = (id) => document.getElementById(id);
const show = (id) => $(id)?.classList.remove('hidden');
const hide = (id) => $(id)?.classList.add('hidden');

// --- ログイン・ログアウト ---
window.handlePasswordReset = async () => {
    const email = $('auth-email').value;
    if (!email) {
        alert('先にメールアドレスを入力してくださいね');
        return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href,
    });
    if (error) {
        $('auth-message').textContent = "リセット失敗: " + error.message;
    } else {
        const msg = "再設定メールを送信しました！メールボックスを確認して、新しい合言葉（パスワード）を決めてくださいね。";
        $('auth-message').textContent = msg;
        alert(msg);
    }
};

window.handlePasswordUpdate = async (e) => {
    e.preventDefault();
    const newPassword = $('new-password').value;
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) {
        $('update-message').textContent = "更新失敗: " + error.message;
    } else {
        alert("合言葉を新しく書き換えました！そのままお入りください。");
        isRecovering = false;
        hide('update-password-section');
        // 更新が成功したのでURLを綺麗にする
        history.replaceState(null, null, window.location.pathname + window.location.search);
        initAuth(); // 状態を再確認してメイン画面へ
    }
};

window.handleLogout = async () => {
    if (!confirm('ログアウトしてもよろしいですか？')) return;
    try {
        // 1. UIを即座に戻す
        handleAuthStateChange(null);
        // 2. ストレージ消去
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-')) localStorage.removeItem(key);
        });
        // 3. サインアウト
        await sb.auth.signOut();
    } catch (e) {
        console.error("Logout Error:", e);
    } finally {
        window.location.reload();
    }
};

// --- 認証 ---
async function initAuth() {
    // 1. URLハッシュを手動でチェック
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    // エラーの検知 (otp_expiredなど、URLにエラーが含まれる場合)
    const errorMsg = params.get('error_description') || params.get('error');
    if (errorMsg) {
        const decodedMsg = decodeURIComponent(errorMsg.replace(/\+/g, ' '));
        $('auth-message').textContent = "認証エラー: " + decodedMsg;
        // ユーザーが混乱しないよう、ハッシュをURLから消去
        history.replaceState(null, null, window.location.pathname + window.location.search);
    }

    // リカバリモードの特急検知 (またはハッシュ直接チェック)
    if (hash.includes('type=recovery') || params.get('type') === 'recovery') {
        console.log("Manual recovery detection!");
        isRecovering = true;
        hide('auth-section');
        show('update-password-section');
        // 【修正】セッション確立に必要なトークンが含まれている可能性があるため、
        // ここではURL（ハッシュ）を消さないようにします。
    }

    const { data: { session } } = await sb.auth.getSession();
    if (!isRecovering) {
        handleAuthStateChange(session);
    }

    sb.auth.onAuthStateChange((event, session) => {
        console.log("Auth Event:", event);
        if (event === 'PASSWORD_RECOVERY') {
            isRecovering = true;
            hide('auth-section');
            show('update-password-section');
        } else {
            // パスワード更新成功後 (isRecovering = false) なら通常どおり表示
            if (!isRecovering) {
                handleAuthStateChange(session);
            }
        }
    });
}

function handleAuthStateChange(session) {
    if (isRecovering) return; // リカバリ中はログイン画面を表示しない
    if (session) {
        currentUser = session.user;
        $('user-info').textContent = `Logged in as: ${currentUser.email}`;
        hide('auth-section'); show('main-app');
        fetchData();
        checkAndMigrateLocalData();
    } else {
        currentUser = null;
        $('user-info').textContent = '';
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


// --- データ取得 ---
async function fetchData() {
    console.log("Fetching latest data from Supabase...");
    const { data: g, error: ge } = await sb.from('goods').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    const { data: t, error: te } = await sb.from('trades').select('*').order('created_at', { ascending: false });
    
    if (ge || te) {
        console.error("Fetch error:", ge || te);
        throw new Error("データの取得に失敗しました");
    }

    goodsData = g || [];
    tradesData = t || [];
    console.log(`Data loaded: ${goodsData.length} items, ${tradesData.length} trades.`);
    
    renderInventory();
    renderTrades();
    updateTradeItemSelects();
}

// --- 在庫管理 ---
window.setInventoryView = (view) => {
    currentInventoryView = view;
    localStorage.setItem('twst_inventory_view', view);
    
    // UIボタンの状態更新
    if (view === 'gallery') {
        $('view-gallery-btn').classList.add('active');
        $('view-list-btn').classList.remove('active');
    } else {
        $('view-list-btn').classList.add('active');
        $('view-gallery-btn').classList.remove('active');
    }
    renderInventory();
};

async function resetPlannedCounts() {
    if (!confirm('全ての「予定数」を「実数 ＋ 未完了の成約取引」で一括再計算しますか？')) return;
    console.log("--- Resetting Planned Counts ---");
    // 全て最新にするために一度 fetchData
    await fetchData();
    for (const g of goodsData) {
        await recalculatePlannedCount(g.id);
    }
    console.log("--- Reset Completed ---");
    fetchData(); // 最終表示
}

function renderInventory() {
    const list = $('goods-list');
    const q = $('goods-search').value.toLowerCase();
    list.innerHTML = '';
    
    const filteredGoods = goodsData.filter(g => g.char.toLowerCase().includes(q) || g.type.toLowerCase().includes(q));

    if (currentInventoryView === 'gallery') {
        list.className = 'goods-gallery-grid';
        filteredGoods.forEach(g => {
            const card = document.createElement('div');
            card.className = 'goods-image-card';
            card.dataset.id = g.id; // 並べ替え用
            card.innerHTML = `
                <div class="drag-handle" title="ドラッグして並び替え"></div>
                <div class="gic-image-wrap" onclick="showOverlay('${g.image_url || ''}')">
                    ${g.image_url ? `<img src="${g.image_url}" class="gic-img">` : '<span class="gic-no-img">No Image</span>'}
                </div>
                <div class="gic-info">
                    <div class="gic-name">
                        <span class="goods-type-label">${g.type}</span><br>
                        <span style="color: var(--accent-gold); font-size: 1rem;">${g.char}</span>
                    </div>
                    <div class="gic-counts">
                        <div class="gic-count-grid">
                            <div class="gic-count-col">
                                <span class="gic-label">予定数</span>
                                <span class="gic-num planned">${g.planned_count ?? g.count}</span>
                            </div>
                            <div class="gic-count-col">
                                <span class="gic-label">実数</span>
                                <div class="gic-controls">
                                    <button class="count-btn" onclick="updateCount('${g.id}', -1); event.stopPropagation();">-</button>
                                    <span class="gic-num actual">${g.count}</span>
                                    <button class="count-btn" onclick="updateCount('${g.id}', 1); event.stopPropagation();">+</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="gic-footer">
                    <button class="nav-btn mini trade-check-btn" onclick="showGoodsDetail('${g.id}'); event.stopPropagation();">取引確認</button>
                    <button class="nav-btn mini" onclick="editGoods('${g.id}'); event.stopPropagation();">編集</button>
                    <button class="nav-btn mini cancel-btn" onclick="deleteGoods('${g.id}'); event.stopPropagation();">削除</button>
                </div>
            `;
            list.appendChild(card);
        });
    } else {
        list.className = 'goods-compact-grid';
        filteredGoods.forEach(g => {
            const card = document.createElement('div');
            card.className = 'goods-card single-line';
            card.dataset.id = g.id; // 並べ替え用
            card.innerHTML = `
                <div class="drag-handle" title="ドラッグして並び替え"></div>
                <div class="goods-info">
                    <div class="goods-name">
                        <span class="goods-type-label">${g.type}</span><br>
                        <span style="color: var(--accent-gold); font-size: 1rem;">${g.char}</span>
                    </div>
                </div>
                <div class="goods-controls-wrap">
                    <div class="count-item">
                        <span class="count-label">予定数</span>
                        <span class="count-num count-planned">${g.planned_count ?? g.count}</span>
                    </div>
                    <div class="count-item actual-control">
                        <span class="count-label">実数</span>
                        <button class="count-btn" onclick="updateCount('${g.id}', -1); event.stopPropagation();">-</button>
                        <span class="count-num">${g.count}</span>
                        <button class="count-btn" onclick="updateCount('${g.id}', 1); event.stopPropagation();">+</button>
                    </div>
                    <div class="card-menu">
                        <button class="nav-btn mini trade-check-btn" onclick="showGoodsDetail('${g.id}'); event.stopPropagation();">取引確認</button>
                        <button class="nav-btn mini" onclick="editGoods('${g.id}'); event.stopPropagation();">編集</button>
                        <button class="nav-btn mini cancel-btn" onclick="deleteGoods('${g.id}'); event.stopPropagation();">削除</button>
                    </div>
                </div>
            `;
            list.appendChild(card);
        });
    }

    // SortableJS の初期化
    initializeSortable();
    // 一括リセットボタンはindex.html側に静的に配置しました。
}

async function updateCount(id, delta) {
    const g = goodsData.find(x => String(x.id) === String(id));
    if (!g) return;
    const newCount = Math.max(0, g.count + delta);
    await sb.from('goods').update({ count: newCount }).eq('id', id);
    
    // ローカルも更新しておくと再計算が正確になる
    g.count = newCount;
    
    // 予定数を再計算
    await recalculatePlannedCount(id);
    fetchData();
}

window.removeGoodsImage = () => {
    $('goods-img-input').value = '';
    $('goods-img-preview').src = '';
    hide('goods-img-preview-container');
    $('goods-img-preview').dataset.url = ''; 
};

$('goods-img-input').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        $('goods-img-preview').src = url;
        $('goods-img-preview').dataset.url = ''; 
        show('goods-img-preview-container');
    }
};

$('add-goods-btn').onclick = () => { 
    $('goods-form').reset(); 
    $('goods-id-edit').value=''; 
    removeGoodsImage();
    show('goods-modal'); 
};

$('goods-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('goods-id-edit').value;
    const count = parseInt($('goods-count').value);
    
    let imageUrl = $('goods-img-preview').dataset.url || null;
    if ($('goods-img-preview-container').classList.contains('hidden')) {
        imageUrl = null;
    }

    const file = $('goods-img-input').files[0];
    if (file) {
        // ファイル名の拡張子を取得
        const ext = file.name.split('.').pop();
        // 日本語や記号を避けるため、一意なIDで保存
        const path = `${currentUser.id}/inv_${Date.now()}.${ext}`;
        
        const { data: uploadData, error: uploadError } = await sb.storage.from('mailing-images').upload(path, file);
        if (!uploadError) {
            imageUrl = sb.storage.from('mailing-images').getPublicUrl(path).data.publicUrl;
        } else {
            console.error("画像アップロード詳細エラー:", uploadError);
            alert("画像アップロードに失敗しました\nエラー詳細：" + (uploadError.message || JSON.stringify(uploadError)));
            return; // 処理を中断
        }
    }

    const data = { 
        user_id: currentUser.id, 
        type: $('goods-type').value, 
        char: $('goods-char').value, 
        count: count, 
        planned_count: count,
        image_url: imageUrl
    };
    const res = id 
        ? await sb.from('goods').update(data).eq('id', id)
        : await sb.from('goods').insert([data]);

    if (res.error) {
        console.error("データベース保存エラー:", res.error);
        alert("データベースへの保存に失敗しました\nエラー詳細：" + res.error.message);
        return;
    }

    // 編集時は予定数がズレている可能性があるので再計算する（ insert 時は data に planned_count: count を入れているのでOK ）
    if (id) {
        await recalculatePlannedCount(id);
    }

    console.log("保存された画像URL:", imageUrl);
    hide('goods-modal'); 
    
    // DB反映ラグ対策として少し待ってから再取得
    setTimeout(fetchData, 500);
};

window.editGoods = (id) => {
    const g = goodsData.find(x => x.id === id);
    if (!g) return;
    $('goods-id-edit').value = g.id; 
    $('goods-type').value = g.type; 
    $('goods-char').value = g.char; 
    $('goods-count').value = g.count;
    
    if (g.image_url) {
        $('goods-img-preview').src = g.image_url;
        $('goods-img-preview').dataset.url = g.image_url;
        show('goods-img-preview-container');
    } else {
        removeGoodsImage();
    }
    show('goods-modal');
};

window.deleteGoods = async (id) => { if (confirm('削除しますか？')) { await sb.from('goods').delete().eq('id', id); fetchData(); } };

// --- 取引管理 ---
function updateTradeItemSelects() {
    const options = goodsData.map(g => `<option value="${g.id}">[${g.type}] ${g.char}</option>`).join('');
    ['give-items-list', 'receive-items-list'].forEach(cid => {
        $(cid).innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const row = document.createElement('div'); 
            row.className = 'item-row-compact';
            row.innerHTML = `
                <select class="item-id"><option value="">--未選択--</option>${options}</select>
                <div class="trade-count-control">
                    <button type="button" class="count-btn" onclick="adjustTradeItemCount(this, -1)">-</button>
                    <span class="item-count">0</span>
                    <button type="button" class="count-btn" onclick="adjustTradeItemCount(this, 1)">+</button>
                </div>
            `;
            $(cid).appendChild(row);
        }
    });
}

window.adjustTradeItemCount = (btn, delta) => {
    const span = btn.parentElement.querySelector('.item-count');
    const newVal = Math.max(0, parseInt(span.textContent) + delta);
    span.textContent = newVal;
};

// 画像削除機能
window.removeTradeImage = () => {
    $('trade-address-img').value = '';
    $('trade-img-preview').src = '';
    hide('trade-img-preview-container');
    // 編集中の場合はURLをクリアしたことを記憶させるためのフラグとしても使える
    $('trade-img-preview').dataset.url = ''; 
};

$('trade-address-img').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        $('trade-img-preview').src = url;
        $('trade-img-preview').dataset.url = ''; // 新規アップロード時は既存URLをクリア
        show('trade-img-preview-container');
    }
};

$('add-trade-btn').onclick = () => {
    $('trade-form').reset(); $('trade-id').value = ''; 
    $('trade-status').value = '成約'; 
    $('trade-img-preview').src = ''; $('trade-img-preview').dataset.url = '';
    hide('trade-img-preview-container');
    updateTradeItemSelects(); 
    toggleModalCheckboxes('成約');
    show('trade-modal');
};

// モーダル内のチェックボックスの活性・非活性を切り替える
function toggleModalCheckboxes(status) {
    const isDisabled = status !== '成約';
    $('trade-is-sent').disabled = isDisabled;
    $('trade-is-received').disabled = isDisabled;
}

$('trade-status').onchange = (e) => toggleModalCheckboxes(e.target.value);

$('trade-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('trade-id').value;
    const giveItems = Array.from($('give-items-list').children)
        .map(r => ({ id: r.querySelector('.item-id').value, count: parseInt(r.querySelector('.item-count').textContent) }))
        .filter(i => i.id && i.count > 0);
    const receiveItems = Array.from($('receive-items-list').children)
        .map(r => ({ id: r.querySelector('.item-id').value, count: parseInt(r.querySelector('.item-count').textContent) }))
        .filter(i => i.id && i.count > 0);

    if (giveItems.length === 0 && receiveItems.length === 0) {
        alert("アイテムを1つ以上選択し、個数を1以上に設定してください。");
        return;
    }
    
    const oldTrade = id ? tradesData.find(t => t.id === id) : null;
    
    // image_urlの決定ロジック
    // 1. プレビューにdataset.urlがあればそれを使う（変更なし）
    // 2. プレビューが非表示ならnull（削除済み）
    // 3. ファイルがあればアップロードして上書き
    let imageUrl = $('trade-img-preview').dataset.url || null;
    if ($('trade-img-preview-container').classList.contains('hidden')) {
        imageUrl = null;
    }

    const file = $('trade-address-img').files[0];
    if (file) {
        const ext = file.name.split('.').pop();
        const path = `${currentUser.id}/trd_${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadError } = await sb.storage.from('mailing-images').upload(path, file);
        if (!uploadError) {
            imageUrl = sb.storage.from('mailing-images').getPublicUrl(path).data.publicUrl;
        } else {
            console.error("画像アップロード詳細エラー:", uploadError);
            alert("画像アップロードに失敗しました\nエラー詳細：" + (uploadError.message || JSON.stringify(uploadError)));
            return; // 処理を中断
        }
    }

    const newStatus = $('trade-status').value;
    const isActuallyContracted = newStatus === '成約';

    const newTradeData = {
        user_id: currentUser.id, name: $('trade-name').value, type: $('trade-type').value, status: newStatus,
        memo: $('trade-memo').value, give_items: giveItems, receive_items: receiveItems,
        give_price: parseInt($('trade-give-price').value), receive_price: parseInt($('trade-receive-price').value),
        image_url: imageUrl,
        // 成約していない場合は強制的にfalseにする（安全のため）
        is_sent: isActuallyContracted ? $('trade-is-sent').checked : false, 
        is_received: isActuallyContracted ? $('trade-is-received').checked : false,
        est_ship_date: $('trade-est-ship-date').value, est_receive_date: $('trade-est-receive-date').value
    };

    // 在庫連動は保存・取得後に実行するためここでは行わない

    console.log("Saving trade data (Ensuring ID with select)...");
    const { data: savedData, error: dbError } = await (id 
        ? sb.from('trades').update(newTradeData).eq('id', id).select()
        : sb.from('trades').insert([newTradeData]).select());

    if (dbError || !savedData?.[0]) {
        console.error("データベース保存エラー:", dbError);
        alert("データベースへの保存に失敗しました\nエラー詳細：" + (dbError?.message || "データが返ってきませんでした"));
        return;
    }

    const savedTrade = savedData[0];
    console.log("Trade saved! ID:", savedTrade.id);

    // 1. ローカルの tradesData を更新
    const tidx = tradesData.findIndex(x => x.id == savedTrade.id);
    if (tidx > -1) tradesData[tidx] = savedTrade; else tradesData.unshift(savedTrade);

    // 2. 在庫の同期実行（実数デルタ ＋ 予定数再計算）
    await syncStock(oldTrade, savedTrade);

    hide('trade-modal'); 
    fetchData(); // 表示の最終同期
};

/**
 * 特定のアイテムの「予定数」を現在の「実数」と「全ての取引データ」から厳密に再計算して更新する
 */
async function recalculatePlannedCount(itemId) {
    const sid = String(itemId);
    // 最新の実数をDBから取得
    const { data: g, error: gError } = await sb.from('goods').select('count').eq('id', sid).single();
    if (gError || !g) {
        console.warn(`Item ${sid} not found for recalculation. Error:`, gError);
        return;
    }

    // 予定数 = 実数 + (成約済みかつ未受取の数) - (成約済みかつ未発送の数)
    let pendingDiff = 0;
    tradesData.forEach(t => {
        if (t.status !== '成約') return;
        
        // 渡すもの (String強制変換で確実に比較)
        const give = (t.give_items || []).find(i => String(i.id) === sid);
        if (give && !t.is_sent) {
            console.log(`[Calculate] item:${sid}, type:GIVE(-${give.count}), trade:${t.name}`);
            pendingDiff -= give.count;
        }
        
        // 受けるもの
        const receive = (t.receive_items || []).find(i => String(i.id) === sid);
        if (receive && !t.is_received) {
            console.log(`[Calculate] item:${sid}, type:RECEIVE(+${receive.count}), trade:${t.name}`);
            pendingDiff += receive.count;
        }
    });

    const newPlanned = Math.max(0, g.count + pendingDiff);
    console.log(`[Result] Item:${sid} -> Actual:${g.count} + PendingDiff:${pendingDiff} = Planned:${newPlanned}`);
    
    // DB更新
    await sb.from('goods').update({ planned_count: newPlanned }).eq('id', sid);
    
    // ローカル変数の即時反映 (fetchを待たずにUI更新)
    const localGood = goodsData.find(x => String(x.id) === sid);
    if (localGood) {
        localGood.count = g.count;
        localGood.planned_count = newPlanned;
    }
    renderInventory(); // 即座に再読み込み
}

async function syncStock(oldT, newT) {
    const affectedItemIds = new Set();
    
    // 1. 実数 (count) の同期
    const updateActual = async (itemId, delta) => {
        const sid = String(itemId);
        // 型不一致を防ぐための String(id) 比較
        const g = goodsData.find(x => String(x.id) === sid);
        if (!g) {
            console.warn(`UpdateActual failed: item ${sid} not found in local goodsData.`);
            return;
        }
        
        const newCount = Math.max(0, g.count + delta);
        console.log(`[UpdateActual] Item:${sid} count: ${g.count} -> ${newCount}`);
        
        const { error } = await sb.from('goods').update({ count: newCount }).eq('id', sid);
        if (error) {
            console.error(`UpdateActual error for item ${sid}:`, error);
            throw new Error(`実数の更新に失敗しました: ${error.message}`);
        }
        g.count = newCount; // 再計算のためにローカルも更新
        affectedItemIds.add(sid);
    };

    // 発送済フラグの変化
    if (!oldT?.is_sent && newT.is_sent) {
        for (const it of (newT.give_items || [])) await updateActual(it.id, -it.count);
    } else if (oldT?.is_sent && !newT.is_sent) {
        for (const it of (oldT.give_items || [])) await updateActual(it.id, it.count);
    } else if (oldT?.is_sent && newT.is_sent) {
        // アイテム内容変更時の補正
        for (const it of (oldT.give_items || [])) await updateActual(it.id, it.count);
        for (const it of (newT.give_items || [])) await updateActual(it.id, -it.count);
    }

    // 受取済フラグの変化
    if (!oldT?.is_received && newT.is_received) {
        for (const it of (newT.receive_items || [])) await updateActual(it.id, it.count);
    } else if (oldT?.is_received && !newT.is_received) {
        for (const it of (oldT.receive_items || [])) await updateActual(it.id, -it.count);
    } else if (oldT?.is_received && newT.is_received) {
        // アイテム内容変更時の補正
        for (const it of (oldT.receive_items || [])) await updateActual(it.id, -it.count);
        for (const it of (newT.receive_items || [])) await updateActual(it.id, it.count);
    }

    // 2. 予定数 (planned_count) の同期
    if (oldT) {
        (oldT.give_items || []).forEach(i => { if(i.id) affectedItemIds.add(String(i.id)); });
        (oldT.receive_items || []).forEach(i => { if(i.id) affectedItemIds.add(String(i.id)); });
    }
    if (newT) {
        (newT.give_items || []).forEach(i => { if(i.id) affectedItemIds.add(String(i.id)); });
        (newT.receive_items || []).forEach(i => { if(i.id) affectedItemIds.add(String(i.id)); });
    }

    console.log(`Syncing stock for items: ${Array.from(affectedItemIds).join(', ')}`);
    for (const itemId of affectedItemIds) {
        await recalculatePlannedCount(itemId);
    }
}

function renderTrades() {
    const list = $('trades-list');
    if (!list) return;
    const filter = $('status-filter').value;
    const imgFilter = $('image-filter').value;
    const q = $('trade-search').value.toLowerCase();
    const mq = $('memo-search').value.toLowerCase();
    list.innerHTML = '';
    
    tradesData
        .filter(t => filter === 'all' || t.status === filter)
        .filter(t => {
            if (imgFilter === 'all') return true;
            if (imgFilter === 'あり') return !!t.image_url;
            if (imgFilter === 'なし') return !t.image_url;
            return true;
        })
        .filter(t => {
            const nameMatch = (t.name || "").toLowerCase().includes(q);
            const memoMatch = (t.memo || "").toLowerCase().includes(mq);
            return nameMatch && memoMatch;
        })
        .forEach(t => {
            const card = document.createElement('div'); card.className = 'trade-card';
            
            const formatItem = i => {
                const sid = String(i.id);
                const g = goodsData.find(gx => String(gx.id) === sid);
                if (!g) {
                    console.warn(`Trade item ID ${sid} not found in goodsData.`);
                    return `<span class="trade-item-line">? (ID:${sid}) ×${i.count}</span>`;
                }
                return `<span class="trade-item-line"><span class="t-item-content"><span class="t-type">${g.type}</span> / <span class="t-char">${g.char}</span> <span class="t-count">×${i.count}</span></span></span>`;
            };
            const giveHtml = (t.give_items || []).map(formatItem).join('');
            const receiveHtml = (t.receive_items || []).map(formatItem).join('');
            
            const isTradeContracted = t.status === '成約';

            card.innerHTML = `
                <div class="trade-card-grid">
                    <div class="tg-name">
                        <span class="trade-user">${t.name}</span>
                    </div>
                    <div class="tg-actions">
                        <div class="t-action-btns">
                            <button class="nav-btn mini" onclick="editTrade('${t.id}')">編集</button>
                            <button class="nav-btn mini cancel-btn" onclick="deleteTrade('${t.id}')">削除</button>
                        </div>
                    </div>
                    <div class="tg-status">
                        <select class="status-quick-change" onchange="quickStatusChange('${t.id}', this.value)">
                            ${['成約','仮約束','お声掛け中'].map(s => `<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    ${t.image_url ? `
                    <div class="tg-image">
                        <img src="${t.image_url}" class="trade-main-img" onclick="showOverlay('${t.image_url}')">
                    </div>` : ''}
                    <div class="tg-body">
                        <div class="trade-items-area">
                            <div class="trade-item-group">
                                <label class="trade-label give">渡すもの</label>
                                <div class="trade-item-list">${giveHtml || 'なし'}</div>
                            </div>
                            <div class="trade-item-group">
                                <label class="trade-label receive">受けるもの</label>
                                <div class="trade-item-list">${receiveHtml || 'なし'}</div>
                            </div>
                        </div>

                        <!-- ブラウザ・デスクトップ専用の日付・チェック表示 -->
                        <div class="trade-info-extra desktop-only">
                            <div class="trade-dates-desktop">
                                <div class="date-check-pair">
                                    <span class="d-label">発送予定:</span>
                                    <input type="date" value="${t.est_ship_date || ''}" class="trade-date-input" onchange="quickDateChange('${t.id}', 'est_ship_date', this.value)">
                                    <label class="tag-inline ${t.is_sent?'done':''} ${!isTradeContracted?'disabled':''}">
                                        <input type="checkbox" ${t.is_sent?'checked':''} ${!isTradeContracted?'disabled':''} onchange="quickCheck('${t.id}', 'is_sent', this.checked)"> 発送済
                                    </label>
                                </div>
                                <div class="date-check-pair">
                                    <span class="d-label">受取予定:</span>
                                    <input type="date" value="${t.est_receive_date || ''}" class="trade-date-input" onchange="quickDateChange('${t.id}', 'est_receive_date', this.value)">
                                    <label class="tag-inline ${t.is_received?'done':''} ${!isTradeContracted?'disabled':''}">
                                        <input type="checkbox" ${t.is_received?'checked':''} ${!isTradeContracted?'disabled':''} onchange="quickCheck('${t.id}', 'is_received', this.checked)"> 受取済
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- スマホ用：フッター配置 -->
                        <div class="trade-footer-grid mobile-only">
                            <div class="date-check-row">
                                <div class="date-input-wrap">
                                    <span class="d-label">発送予定:</span>
                                    <input type="date" value="${t.est_ship_date || ''}" class="trade-date-input" onchange="quickDateChange('${t.id}', 'est_ship_date', this.value)">
                                </div>
                                <label class="tag-check ${t.is_sent?'done':''} ${!isTradeContracted?'disabled':''}">
                                    <input type="checkbox" ${t.is_sent?'checked':''} ${!isTradeContracted?'disabled':''} onchange="quickCheck('${t.id}', 'is_sent', this.checked)"> 発送済
                                </label>
                            </div>
                            <div class="date-check-row">
                                <div class="date-input-wrap">
                                    <span class="d-label">受取予定:</span>
                                    <input type="date" value="${t.est_receive_date || ''}" class="trade-date-input" onchange="quickDateChange('${t.id}', 'est_receive_date', this.value)">
                                </div>
                                <label class="tag-check ${t.is_received?'done':''} ${!isTradeContracted?'disabled':''}">
                                    <input type="checkbox" ${t.is_received?'checked':''} ${!isTradeContracted?'disabled':''} onchange="quickCheck('${t.id}', 'is_received', this.checked)"> 受取済
                                </label>
                            </div>
                        </div>

                        ${t.memo ? `<div class="trade-memo-box"><span class="memo-label">メモ：</span>${t.memo}</div>` : ''}
                    </div>
                </div>
            `;
            list.appendChild(card);
        });
}

window.quickStatusChange = async (id, newS) => {
    const t = tradesData.find(x => String(x.id) === String(id));
    if (!t) return;
    const newT = JSON.parse(JSON.stringify(t)); newT.status = newS;
    if (newS !== '成約') { newT.is_sent = false; newT.is_received = false; }
    
    // DB更新を先行し、結果を確実に受け取る (select()を使用)
    const { data: saved, error } = await sb.from('trades').update({ 
        status: newS, is_sent: newT.is_sent, is_received: newT.is_received 
    }).eq('id', id).select();
    
    if (error || !saved?.[0]) {
        console.error("Quick status update error:", error);
        return;
    }

    // ローカル更新
    const idx = tradesData.findIndex(x => String(x.id) === String(id));
    if (idx > -1) tradesData[idx] = saved[0];

    // 同期実行
    await syncStock(t, saved[0]);
    fetchData();
};

window.quickCheck = async (id, field, value) => {
    const t = tradesData.find(x => String(x.id) === String(id));
    if (!t || t.status !== '成約') return;
    const newT = JSON.parse(JSON.stringify(t)); newT[field] = value;

    // DB更新を先行し、結果を確実に受け取る
    const { data: saved, error } = await sb.from('trades').update({ [field]: value }).eq('id', id).select();
    
    if (error || !saved?.[0]) {
        console.error("Quick check update error:", error);
        return;
    }

    // ローカル更新
    const idx = tradesData.findIndex(x => String(x.id) === String(id));
    if (idx > -1) tradesData[idx] = saved[0];

    await syncStock(t, saved[0]);
    fetchData();
};

window.quickDateChange = async (id, field, value) => {
    await sb.from('trades').update({ [field]: value }).eq('id', id);
    const t = tradesData.find(x => x.id === id);
    if (t) t[field] = value;
};

window.editTrade = (id) => {
    const t = tradesData.find(x => String(x.id) === String(id));
    if (!t) return;
    $('trade-id').value = t.id; $('trade-name').value = t.name; $('trade-type').value = t.type; $('trade-status').value = t.status;
    $('trade-give-price').value = t.give_price; $('trade-receive-price').value = t.receive_price;
    $('trade-memo').value = t.memo || '';
    $('trade-is-sent').checked = t.is_sent; $('trade-is-received').checked = t.is_received;
    $('trade-est-ship-date').value = t.est_ship_date || ''; $('trade-est-receive-date').value = t.est_receive_date || '';

    toggleModalCheckboxes(t.status);
    updateTradeItemSelects();
    
    // アイテムの流し込み
    const giveList = $('give-items-list').children;
    const receiveList = $('receive-items-list').children;
    (t.give_items || []).forEach((item, idx) => { 
        if (giveList[idx]) { 
            giveList[idx].querySelector('.item-id').value = item.id; 
            giveList[idx].querySelector('.item-count').textContent = item.count; 
        } 
    });
    (t.receive_items || []).forEach((item, idx) => { 
        if (receiveList[idx]) { 
            receiveList[idx].querySelector('.item-id').value = item.id; 
            receiveList[idx].querySelector('.item-count').textContent = item.count; 
        } 
    });

    // 画像の流し込み
    if (t.image_url) {
        $('trade-img-preview').src = t.image_url;
        $('trade-img-preview').dataset.url = t.image_url;
        show('trade-img-preview-container');
    } else {
        $('trade-img-preview').src = '';
        $('trade-img-preview').dataset.url = '';
        hide('trade-img-preview-container');
    }
    show('trade-modal');
};

window.deleteTrade = async (id) => {
    if (!confirm('取引を削除しますか？在庫への影響も取り消されます。')) return;
    const t = tradesData.find(x => String(x.id) === String(id));
    if (t) {
        // 削除前に、在庫変動をすべて逆再生する
        console.log("Undoing trade stock impacts before deletion...");
        const undoT = JSON.parse(JSON.stringify(t));
        undoT.status = 'キャンセル';
        undoT.is_sent = false;
        undoT.is_received = false;
        await syncStock(t, undoT);
    }
    await sb.from('trades').delete().eq('id', id);
    fetchData();
};

// --- グッズ詳細モーダル ---
window.showGoodsDetail = (goodsId) => {
    const sid = String(goodsId);
    const g = goodsData.find(x => String(x.id) === sid);
    if (!g) return;

    // タイトル設定
    $('gd-title').textContent = `【${g.type}】${g.char} の取引一覧`;

    // 対象の取引を抽出
    const pendingRows = []; // ① 未発送
    const shippedRows = []; // ② 発送済

    tradesData.forEach(t => {
        // give_items に含まれているか
        const giveItem = (t.give_items || []).find(i => String(i.id) === sid);
        // receive_items に含まれているか
        const receiveItem = (t.receive_items || []).find(i => String(i.id) === sid);

        if (!giveItem && !receiveItem) return; // このグッズに無関係

        const buildRow = (item, direction) => {
            const dirLabel = direction === 'give' ? '渡す' : '受ける';
            const dirClass = direction === 'give' ? 'give' : 'receive';
            return `
                <div class="gd-trade-row">
                    <span class="gd-trade-name">${t.name || '（名前なし）'}</span>
                    <span class="gd-trade-count">×${item.count}</span>
                    <span class="gd-badge ${dirClass}">${dirLabel}</span>
                    <span class="gd-status-chip">${t.status}</span>
                </div>`;
        };

        if (t.is_sent) {
            // ② 発送済み
            if (giveItem) shippedRows.push(buildRow(giveItem, 'give'));
            if (receiveItem) shippedRows.push(buildRow(receiveItem, 'receive'));
        } else {
            // ① 未発送（ステータス問わず）
            if (giveItem) pendingRows.push(buildRow(giveItem, 'give'));
            if (receiveItem) pendingRows.push(buildRow(receiveItem, 'receive'));
        }
    });

    $('gd-pending-list').innerHTML = pendingRows.length
        ? pendingRows.join('')
        : '<div class="gd-empty">（なし）</div>';

    $('gd-shipped-list').innerHTML = shippedRows.length
        ? shippedRows.join('')
        : '<div class="gd-empty">（なし）</div>';

    show('goods-detail-modal');
};

window.closeGoodsDetail = () => hide('goods-detail-modal');

// --- その他UI & ページ維持 ---
function switchSection(section) {
    if (section === 'inventory') {
        show('inventory-section'); hide('trades-section');
        $('nav-inventory').classList.add('active'); $('nav-trades').classList.remove('active');
    } else {
        hide('inventory-section'); show('trades-section');
        $('nav-inventory').classList.remove('active'); $('nav-trades').classList.add('active');
    }
    localStorage.setItem('twst_active_section', section);
}

$('nav-inventory').onclick = () => switchSection('inventory');
$('nav-trades').onclick = () => switchSection('trades');


function handleAuthStateChange(session) {
    if (isRecovering) return;
    if (session) {
        currentUser = session.user;
        $('user-info').textContent = `Logged in as: ${currentUser.email}`;
        hide('auth-section'); show('main-app');
        fetchData();
        checkAndMigrateLocalData();
        // 最後にいた画面を復元
        const saved = localStorage.getItem('twst_active_section') || 'inventory';
        switchSection(saved);
    } else {
        currentUser = null;
        $('user-info').textContent = '';
        show('auth-section'); hide('main-app');
    }
}
document.querySelectorAll('.cancel-btn').forEach(b => {
    if (b.id === 'logout-btn') return; // ログアウトボタンは除外
    b.onclick = () => { 
        hide('goods-modal'); 
        hide('trade-modal'); 
        removeGoodsImage(); // ここで画像プレビューをリセットしておく
    };
});

// モーダル背景クリックで閉じる
['goods-modal', 'trade-modal', 'goods-detail-modal'].forEach(id => {
    $(id).onclick = (e) => {
        if (e.target === e.currentTarget) {
            hide(id);
            if (id === 'goods-modal') removeGoodsImage();
        }
    };
});
window.showOverlay = (url) => { $('overlay-img').src = url; show('image-overlay'); };
$('image-overlay').onclick = () => hide('image-overlay');
$('goods-search').oninput = renderInventory;
$('trade-search').oninput = renderTrades; // 追加
$('status-filter').onchange = renderTrades;

function initializeSortable() {
    const list = $('goods-list');
    if (window.inventorySortable) window.inventorySortable.destroy();
    
    // 検索中は並び替えを無効化
    if ($('goods-search').value) return;

    window.inventorySortable = new Sortable(list, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        handle: '.drag-handle', // ハンドルのみドラッグ可能にする
        onEnd: async () => {
            const ids = Array.from(list.children).map(el => el.dataset.id);
            // 順番を一斉更新
            for (let i = 0; i < ids.length; i++) {
                await sb.from('goods').update({ sort_order: i }).eq('id', ids[i]);
            }
            // ローカルのデータも一応更新
            ids.forEach((id, i) => {
                const g = goodsData.find(x => x.id === id);
                if (g) g.sort_order = i;
            });
        }
    });
}

async function checkAndMigrateLocalData() {
    const local = JSON.parse(localStorage.getItem('twst_goods') || '[]');
    if (local.length > 0 && confirm('ローカルデータを同期しますか？')) {
        for (const g of local) { await sb.from('goods').insert([{ user_id: currentUser.id, type: g.type, char: g.char, count: g.count, planned_count: g.count }]); }
        localStorage.removeItem('twst_goods'); fetchData();
    }
}
// 初期化時にビューを設定
setInventoryView(currentInventoryView);
initAuth();
