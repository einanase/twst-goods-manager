// --- State Management ---
let goods = JSON.parse(localStorage.getItem('twst-goods')) || [];
let trades = JSON.parse(localStorage.getItem('twst-trades')) || [];

// Constants
const STATUS_IN_FLIGHT = ['成約', '発送済', '受取済'];

// --- DOM Elements ---
const navInventory = document.getElementById('nav-inventory');
const navTrades = document.getElementById('nav-trades');
const inventorySection = document.getElementById('inventory-section');
const tradesSection = document.getElementById('trades-section');

const goodsList = document.getElementById('goods-list');
const tradesList = document.getElementById('trades-list');

const goodsModal = document.getElementById('goods-modal');
const tradeModal = document.getElementById('trade-modal');
const addGoodsBtn = document.getElementById('add-goods-btn');
const addTradeBtn = document.getElementById('add-trade-btn');

const goodsForm = document.getElementById('goods-form');
const goodsIdInput = document.createElement('input'); // 編集用ID保持
goodsIdInput.type = 'hidden';
goodsIdInput.id = 'goods-id-edit';
goodsForm.appendChild(goodsIdInput);

const tradeForm = document.getElementById('trade-form');
const tradeGiveGoodsSelect = document.getElementById('trade-give-goods-id');

const imageOverlay = document.getElementById('image-overlay');
const overlayImg = document.getElementById('overlay-img');
const closeOverlay = document.querySelector('.close-overlay');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    renderGoods();
    renderTrades();
    updateGiveGoodsOptions();
    setupEventListeners();
});

function setupEventListeners() {
    // Navigation
    navInventory.addEventListener('click', () => switchTab('inventory'));
    navTrades.addEventListener('click', () => switchTab('trades'));

    // Modals
    addGoodsBtn.addEventListener('click', () => {
        goodsForm.reset();
        document.getElementById('goods-id-edit').value = '';
        document.querySelector('#goods-modal h3').textContent = 'グッズ新規登録';
        showModal(goodsModal);
    });
    addTradeBtn.addEventListener('click', () => {
        tradeForm.reset();
        document.getElementById('trade-id').value = '';
        document.getElementById('image-preview').innerHTML = '';
        showModal(tradeModal);
    });

    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', hideAllModals);
    });

    // Forms
    goodsForm.addEventListener('submit', handleGoodsSubmit);
    tradeForm.addEventListener('submit', handleTradeSubmit);

    // Image Upload
    const fileInput = document.getElementById('trade-address-img');
    fileInput.addEventListener('change', handleImageSelect);

    // Overlay
    closeOverlay.addEventListener('click', () => imageOverlay.classList.add('hidden'));
}

// --- Tab Switching ---
function switchTab(tab) {
    if (tab === 'inventory') {
        navInventory.classList.add('active');
        navTrades.classList.remove('active');
        inventorySection.classList.remove('hidden');
        tradesSection.classList.add('hidden');
    } else {
        navTrades.classList.add('active');
        navInventory.classList.remove('active');
        tradesSection.classList.remove('hidden');
        inventorySection.classList.add('hidden');
        renderTrades(); // Refresh
    }
}

// --- Modal Helpers ---
function showModal(modal) {
    modal.classList.remove('hidden');
}

function hideAllModals() {
    goodsModal.classList.add('hidden');
    tradeModal.classList.add('hidden');
}

// --- Goods Logic ---
function handleGoodsSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('goods-id-edit').value;
    const type = document.getElementById('goods-type').value;
    const char = document.getElementById('goods-char').value;
    const count = parseInt(document.getElementById('goods-count').value);

    if (id) {
        // 編集
        const item = goods.find(g => g.id === id);
        if (item) {
            item.type = type;
            item.char = char;
            item.count = count;
        }
    } else {
        // 新規登録
        const newGoods = {
            id: Date.now().toString(),
            type,
            char,
            count
        };
        goods.push(newGoods);
    }

    saveGoods();
    renderGoods();
    updateGiveGoodsOptions();
    hideAllModals();
    goodsForm.reset();
}

function renderGoods() {
    goodsList.innerHTML = '';
    goods.forEach(item => {
        const card = document.createElement('div');
        card.className = 'goods-card';
        card.innerHTML = `
            <div class="goods-info">
                <h4>${item.type}</h4>
                <p class="char-name">${item.char}</p>
            </div>
            <div class="goods-controls">
                <div class="counter-group">
                    <button class="count-btn" onclick="updateItemCount('${item.id}', -1)">-</button>
                    <span class="count-display">${item.count}</span>
                    <button class="count-btn" onclick="updateItemCount('${item.id}', 1)">+</button>
                </div>
                <div class="btn-group" style="display:flex; gap: 0.5rem;">
                    <button class="nav-btn" style="padding: 4px 8px; font-size:0.7rem;" onclick="editGoods('${item.id}')">編集</button>
                    <button class="cancel-btn" style="padding: 4px 8px; font-size:0.7rem;" onclick="deleteGoods('${item.id}')">削除</button>
                </div>
            </div>
        `;
        goodsList.appendChild(card);
    });
}

function editGoods(id) {
    const item = goods.find(g => g.id === id);
    if (!item) return;

    document.getElementById('goods-id-edit').value = item.id;
    document.getElementById('goods-type').value = item.type;
    document.getElementById('goods-char').value = item.char;
    document.getElementById('goods-count').value = item.count;
    
    document.querySelector('#goods-modal h3').textContent = 'グッズ情報の編集';
    showModal(goodsModal);
}

function updateItemCount(id, delta) {
    const item = goods.find(g => g.id === id);
    if (item) {
        item.count = Math.max(0, item.count + delta);
        saveGoods();
        renderGoods();
    }
}

function deleteGoods(id) {
    if (confirm('このグッズを削除しますか？紐づく取引がある場合、在庫数は戻りません。')) {
        goods = goods.filter(g => g.id !== id);
        saveGoods();
        renderGoods();
        updateGiveGoodsOptions();
    }
}

function saveGoods() {
    localStorage.setItem('twst-goods', JSON.stringify(goods));
}

function updateGiveGoodsOptions() {
    tradeGiveGoodsSelect.innerHTML = '<option value="">選択してください</option>';
    goods.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = `[${item.type}] ${item.char} (残り: ${item.count})`;
        tradeGiveGoodsSelect.appendChild(opt);
    });
}

// --- Trade Logic ---
async function handleTradeSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('trade-id').value || Date.now().toString();
    const prevTrade = trades.find(t => t.id === id);
    
    const newTrade = {
        id,
        name: document.getElementById('trade-name').value,
        type: document.getElementById('trade-type').value,
        status: document.getElementById('trade-status').value,
        giveGoodsId: document.getElementById('trade-give-goods-id').value,
        giveCount: parseInt(document.getElementById('trade-give-count').value),
        receiveDesc: document.getElementById('trade-receive-desc').value,
        givePrice: parseInt(document.getElementById('trade-give-price').value),
        receivePrice: parseInt(document.getElementById('trade-receive-price').value),
        hasImage: !!document.getElementById('trade-address-img').files[0] || (prevTrade && prevTrade.hasImage)
    };

    // --- Inventory Sync Logic ---
    syncInventory(prevTrade, newTrade);

    // Save Image if any
    const file = document.getElementById('trade-address-img').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            await saveImage(id, e.target.result);
            finalizeTradeSave(id, newTrade);
        };
        reader.readAsDataURL(file);
    } else {
        finalizeTradeSave(id, newTrade);
    }
}

function finalizeTradeSave(id, newTrade) {
    const index = trades.findIndex(t => t.id === id);
    if (index !== -1) {
        trades[index] = newTrade;
    } else {
        trades.push(newTrade);
    }
    
    saveTrades();
    renderTrades();
    renderGoods(); // Update counts in UI
    updateGiveGoodsOptions();
    hideAllModals();
}

function syncInventory(prev, current) {
    const wasInFlight = prev ? STATUS_IN_FLIGHT.includes(prev.status) : false;
    const isInFlight = STATUS_IN_FLIGHT.includes(current.status);

    // Case 1: Status changed to In-Flight (Subtract)
    if (!wasInFlight && isInFlight) {
        updateGoodsStock(current.giveGoodsId, -current.giveCount);
    }
    // Case 2: Status changed FROM In-Flight (Add back)
    else if (wasInFlight && !isInFlight) {
        updateGoodsStock(prev.giveGoodsId, prev.giveCount);
    }
    // Case 3: Remains In-Flight but count/item changed
    else if (wasInFlight && isInFlight) {
        // Return previous count and subtract new count
        updateGoodsStock(prev.giveGoodsId, prev.giveCount);
        updateGoodsStock(current.giveGoodsId, -current.giveCount);
    }
}

function updateGoodsStock(goodsId, delta) {
    const item = goods.find(g => g.id === goodsId);
    if (item) {
        item.count += delta;
        saveGoods();
    }
}

function renderTrades() {
    tradesList.innerHTML = '';
    const filter = document.getElementById('status-filter').value;

    trades.filter(t => filter === 'all' || t.status === filter).forEach(async trade => {
        const card = document.createElement('div');
        card.className = 'trade-card';
        
        const goodsItem = goods.find(g => g.id === trade.giveGoodsId);
        const goodsName = goodsItem ? `[${goodsItem.type}] ${goodsItem.char}` : '不明なグッズ';

        card.innerHTML = `
            <div class="trade-header">
                <span class="trade-user">${trade.name}</span>
                <span class="trade-status-badge">${trade.status}</span>
            </div>
            <div class="trade-details">
                <p><strong>種類:</strong> ${trade.type}</p>
                <p><strong>渡す:</strong> ${goodsName} × ${trade.giveCount}</p>
                <p><strong>受ける:</strong> ${trade.receiveDesc || 'なし'}</p>
                <p><strong>精算:</strong> 渡:¥${trade.givePrice} / 受:¥${trade.receivePrice}</p>
            </div>
            <div class="trade-actions" style="display:flex; justify-content: space-between; align-items:center;">
                <div id="img-container-${trade.id}"></div>
                <div class="btn-group" style="display:flex; gap: 0.5rem;">
                    <button class="nav-btn" style="padding:4px 10px;" onclick="editTrade('${trade.id}')">編集</button>
                    <button class="cancel-btn" style="padding:4px 10px;" onclick="deleteTrade('${trade.id}')">削除</button>
                </div>
            </div>
        `;
        tradesList.appendChild(card);

        // Load image thumbnail if exists
        if (trade.hasImage) {
            const dataUrl = await getImage(trade.id);
            if (dataUrl) {
                const img = document.createElement('img');
                img.src = dataUrl;
                img.className = 'trade-address-thumb';
                img.onclick = () => openImageOverlay(dataUrl);
                document.getElementById(`img-container-${trade.id}`).appendChild(img);
            }
        }
    });

    // Re-bind filter event
    document.getElementById('status-filter').onchange = renderTrades;
}

function openImageOverlay(src) {
    overlayImg.src = src;
    imageOverlay.classList.remove('hidden');
}

function editTrade(id) {
    const trade = trades.find(t => t.id === id);
    if (!trade) return;

    document.getElementById('trade-id').value = trade.id;
    document.getElementById('trade-name').value = trade.name;
    document.getElementById('trade-type').value = trade.type;
    document.getElementById('trade-status').value = trade.status;
    document.getElementById('trade-give-goods-id').value = trade.giveGoodsId;
    document.getElementById('trade-give-count').value = trade.giveCount;
    document.getElementById('trade-receive-desc').value = trade.receiveDesc;
    document.getElementById('trade-give-price').value = trade.givePrice;
    document.getElementById('trade-receive-price').value = trade.receivePrice;

    showModal(tradeModal);
}

function deleteTrade(id) {
    if (confirm('取引を解除しますか？成約済みの場合は在庫が戻ります。')) {
        const trade = trades.find(t => t.id === id);
        if (trade && STATUS_IN_FLIGHT.includes(trade.status)) {
            updateGoodsStock(trade.giveGoodsId, trade.giveCount);
        }
        trades = trades.filter(t => t.id !== id);
        deleteImage(id);
        saveTrades();
        renderTrades();
        renderGoods();
        updateGiveGoodsOptions();
    }
}

function saveTrades() {
    localStorage.setItem('twst-trades', JSON.stringify(trades));
}

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('upload-label').textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('image-preview').innerHTML = `<img src="${e.target.result}" style="max-width:100px;">`;
        };
        reader.readAsDataURL(file);
    }
}

// Global functions for inline EventListeners
window.updateItemCount = updateItemCount;
window.editGoods = editGoods;
window.deleteGoods = deleteGoods;
window.editTrade = editTrade;
window.deleteTrade = deleteTrade;
window.openImageOverlay = openImageOverlay;
window.renderTrades = renderTrades;
