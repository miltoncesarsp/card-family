// app.js - VERSÃO COMPLETA (COM PASTAS E EVOLUÇÃO)

// Variáveis Globais
let player = null;
let cardsInAlbum = [];
let allGameCards = []; 
let packsAvailable = [];
let evolutionRules = {}; // Regras de evolução (ex: {Comum: 5})
let currentOriginView = null; // Controla em qual pasta estamos
const BUCKET_NAME = 'cards';

// Elementos da Tela de Login
const loginScreen = document.getElementById('login-screen');
const gameContent = document.getElementById('game-content');
const emailInput = document.getElementById('emailInput');
const passInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');

// ------------------------------------
// 1. Funções de Autenticação
// ------------------------------------

async function handleLoginClick() {
    const email = emailInput.value;
    const password = passInput.value;
    
    if (!email || !password) {
        loginError.textContent = "Preencha e-mail e senha.";
        return;
    }
    loginError.textContent = "Entrando...";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) loginError.textContent = "Erro: " + error.message;
}

async function handleRegisterClick() {
    const email = emailInput.value;
    const password = passInput.value;
    if (password.length < 6) {
        loginError.textContent = "Senha mínima: 6 caracteres.";
        return;
    }
    loginError.textContent = "Criando conta...";
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) loginError.textContent = "Erro: " + error.message;
    else alert("Conta criada! Você já está logado.");
}

async function handleLogout() {
    await supabase.auth.signOut();
}

function updateUIState(session) {
    if (session) {
        loginScreen.classList.add('hidden');
        gameContent.classList.remove('hidden');
        loadPlayerData(session.user.id);
    } else {
        loginScreen.classList.remove('hidden');
        gameContent.classList.add('hidden');
        player = null;
        cardsInAlbum = [];
        if(emailInput) emailInput.value = "";
        if(passInput) passInput.value = "";
    }
}

// ------------------------------------
// 2. Carregamento de Dados
// ------------------------------------

async function loadPlayerData(userId) {
    // 1. Busca jogador
    let { data: playerData, error } = await supabase.from('jogadores').select('*').eq('id', userId).single();

    // Rede de segurança se jogador não existir
    if (!playerData) {
        console.log("Criando jogador manualmente...");
        const { data: { session } } = await supabase.auth.getSession();
        const userEmail = session?.user?.email || "usuario@email.com";
        await supabase.from('jogadores').insert([{
            id: userId, email: userEmail, nome: userEmail.split('@')[0], nivel: 1, moedas: 500, total_cartas: 0
        }]);
        return loadPlayerData(userId);
    }
    
    player = playerData;
    updateHeaderInfo();

    // 2. Carrega Regras de Evolução
    await loadEvolutionRules();

    // 3. Carrega TODAS as cartas do jogo
    const { data: allCardsData } = await supabase.from('cards').select('*, personagens_base(origem)').order('power', { ascending: true });
    if (allCardsData) allGameCards = allCardsData;

    // 4. Carrega as cartas do Jogador
    const { data: playerCardData } = await supabase.from('cartas_do_jogador').select(`quantidade, card_id`).eq('jogador_id', userId);

    // 5. Cruza os dados
    if (allGameCards.length > 0) {
        cardsInAlbum = allGameCards.map(gameCard => {
            const userHas = playerCardData?.find(item => item.card_id === gameCard.id);
            return {
                ...gameCard,
                quantidade: userHas ? userHas.quantidade : 0,
                owned: !!userHas
            };
        });
    }

    if (packsAvailable.length === 0) await loadPacks();
    await loadOriginCovers();
    renderAlbum(); 
}

async function loadPacks() {
    const { data } = await supabase.from('pacotes').select('*').order("preco_moedas");
    if (data) {
        packsAvailable = data;
        renderShop(); 
    }
}

async function loadEvolutionRules() {
    const { data } = await supabase.from('regras_raridade').select('*');
    if (data) {
        evolutionRules = data.reduce((acc, rule) => {
            acc[rule.raridade_nome] = rule.repetidas_para_evoluir;
            return acc;
        }, {});
    }
}

function updateHeaderInfo() {
    if (!player) return;
    document.getElementById('player-name').textContent = player.nome;
    document.getElementById('player-coins').innerHTML = `<i class="fas fa-coins"></i> ${player.moedas}`;
}

// ------------------------------------
// 3. Lógica do Álbum (Pastas e Renderização)
// ------------------------------------

function renderAlbum() {
    const container = document.getElementById('album-cards-container');
    if (!container || !player) return;

    if (cardsInAlbum.length === 0) {
        container.innerHTML = `<p style="color: white; text-align: center;">Carregando dados...</p>`;
        return;
    }

    // Agrupa dados por Origem
    const originsData = {};
    cardsInAlbum.forEach(card => {
        const origem = card.personagens_base ? card.personagens_base.origem : 'Outros';
        if (!originsData[origem]) {
            originsData[origem] = { name: origem, total: 0, owned: 0, cards: [] };
        }
        originsData[origem].cards.push(card);
        originsData[origem].total++;
        if (card.owned) originsData[origem].owned++;
    });

    // VISÃO 1: DENTRO DA PASTA
    if (currentOriginView) {
        const currentData = originsData[currentOriginView];
        
        let html = `
            <div style="width: 100%; margin-bottom: 20px;">
                <button class="back-btn" onclick="closeOriginView()">
                    <i class="fas fa-arrow-left"></i> Voltar
                </button>
                <h2 class="origin-title" style="text-align: center;">
                    ${currentOriginView} <span style="font-size: 0.6em; color: #aaa;">(${currentData.owned}/${currentData.total})</span>
                </h2>
            </div>
            <div class="card-grid">
        `;

        const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];
        currentData.cards.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));

        currentData.cards.forEach(card => {
            const rarityStyles = getRarityColors(card.rarity);
            
            if (card.owned) {
                // Lógica do Botão de Evolução
                const cost = evolutionRules[card.rarity] || 999;
                let evolutionBtnHTML = '';
                if (card.quantidade >= cost && card.rarity !== 'Mítica') {
                    evolutionBtnHTML = `
                        <div class="evolution-btn" onclick="handleEvolution('${card.id}', '${card.rarity}')">
                            <i class="fas fa-arrow-up"></i> Evoluir
                        </div>
                    `;
                }

                const elementStyles = getElementStyles(card.element);

            html += `
                    <div class="card-preview card-small card-collected" 
                         style="background-image: url('${card.image_url}'); border: 3px solid ${rarityStyles.primary};" 
                         title="${card.name}">
                        
                        ${evolutionBtnHTML}
                        
                        <div class="card-quantity">x${card.quantidade}</div>
                        
                        <div class="card-element-badge" style="background: ${elementStyles.background};">
                            ${getElementIcon(card.element)}
                        </div>

                        <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">${card.rarity.substring(0,1)}</div>
                        <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${card.power}</div>
                        
                        <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
                    </div>
                `;
            } else {
                html += `
                    <div class="card-preview card-small card-missing" 
                         style="background-image: url('${card.image_url}'); border: 2px dashed #555;">
                         <div class="card-name-footer">${card.name}</div>
                    </div>
                `;
            }
        });

        html += `</div>`;
        container.innerHTML = html;
        return;
    }

    // VISÃO 2: MENU PRINCIPAL (PASTAS)
    let html = `<div class="origin-hub-grid">`;
    for (const [key, data] of Object.entries(originsData)) {
        const percentage = Math.round((data.owned / data.total) * 100);
        const barColor = percentage === 100 ? '#2ecc71' : '#007bff';
        
        // Tenta pegar a capa do banco. Se não tiver, usa null.
        const coverImage = originCovers[data.name]; 
        
        // Se tiver imagem, põe no background. Se não, usa gradiente padrão.
        const bgStyle = coverImage 
            ? `background-image: url('${coverImage}'); background-size: cover; background-position: center;` 
            : `background: linear-gradient(145deg, #2c3e50, #000000);`;
            
        const overlayClass = coverImage ? 'has-cover' : '';

        html += `
            <div class="origin-folder ${overlayClass}" onclick="openOriginView('${data.name}')" style="${bgStyle}">
                <div class="origin-content-overlay">
                    <div class="origin-name">${data.name}</div>
                    <div class="origin-stats">${data.owned} / ${data.total} Cartas</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${percentage}%; background-color: ${barColor};"></div>
                    </div>
                    <div style="margin-top:5px; font-size: 0.8em; color: ${barColor}; font-weight:bold;">${percentage}%</div>
                </div>
            </div>
        `;
    }
    html += `</div>`;
    container.innerHTML = html;
}

function openOriginView(originName) {
    currentOriginView = originName;
    renderAlbum();
    window.scrollTo(0,0);
}

function closeOriginView() {
    currentOriginView = null;
    renderAlbum();
}

async function handleEvolution(cardId, rarity) {
    event.stopPropagation(); 
    const cost = evolutionRules[rarity];
    if(!confirm(`Gastar ${cost} cartas para tentar evoluir? (Funcionalidade em breve)`)) return;
    // Implementar lógica de backend aqui
}

// ------------------------------------
// 4. Lógica da Loja e Helpers
// ------------------------------------

function renderShop() {
    const container = document.getElementById('packs-list-container');
    if (!container || !player) return;

    let html = '';
    packsAvailable.forEach(pack => {
        // Define uma imagem padrão caso o pacote não tenha capa
        const bgImage = pack.imagem_url ? `url('${pack.imagem_url}')` : 'none';
        const bgClass = pack.imagem_url ? 'has-image' : 'no-image';

        html += `
            <div class="pack-item ${bgClass}" style="background-image: ${bgImage}">
                <div class="pack-content-overlay">
                    <h4>${pack.nome}</h4>
                    <p class="pack-info">Contém <strong>${pack.cartas_total} cartas</strong></p>
                    <button class="buy-pack-btn" data-id="${pack.id}" data-price="${pack.preco_moedas}">
                        <i class="fas fa-coins"></i> ${pack.preco_moedas}
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    document.querySelectorAll('.buy-pack-btn').forEach(btn => btn.addEventListener('click', handleBuyPack));
}

async function handleBuyPack(event) {
    if (!player) return;
    const packId = event.currentTarget.dataset.id;
    const packPrice = parseInt(event.currentTarget.dataset.price);

    if (player.moedas < packPrice) { showNotification("Moedas insuficientes!", true); return; }
    if (!confirm(`Comprar este pacote?`)) return;

    const newCoins = player.moedas - packPrice;
    const { error } = await supabase.from('jogadores').update({ moedas: newCoins }).eq('id', player.id);
    
    if (error) { showNotification("Erro na compra.", true); return; }
    player.moedas = newCoins; updateHeaderInfo();

    const packData = packsAvailable.find(p => p.id == packId);
    const newCards = await generateCardsForPack(packData);
    
    if (newCards.length === 0) { showNotification("Pacote vazio (Erro Admin)", true); return; }

    await updatePlayerCards(newCards);
    showPackOpeningModal(newCards);
}

function getElementStyles(element) {
    switch (element.toLowerCase()) {
        case "terra": return { primary: "#8B4513", background: "linear-gradient(135deg, #A0522D 0%, #6B8E23 100%)" };
        case "fogo": return { primary: "#FF4500", background: "linear-gradient(135deg, #FF4500 0%, #FFD700 100%)" };
        case "água": return { primary: "#1E90FF", background: "linear-gradient(135deg, #1E90FF 0%, #87CEEB 100%)" };
        case "ar": return { primary: "#5F9EA0", background: "linear-gradient(135deg, #708090 0%, #B0C4DE 100%)" };
        case "tecnologia": return { primary: "#00CED1", background: "linear-gradient(135deg, #00CED1 0%, #191970 100%)" };
        case "luz": return { primary: "#DAA520", background: "linear-gradient(135deg, #FFD700 0%, #DAA520 100%)" };
        case "sombra": return { primary: "#4B0082", background: "linear-gradient(135deg, #4B0082 0%, #000000 100%)" };
        default: return { primary: "#A9A9A9", background: "#A9A9A9" };
    }
}

function getElementIcon(element) {
    switch (element.toLowerCase()) {
        case "terra": return '<i class="fas fa-leaf"></i>';
        case "fogo": return '<i class="fas fa-fire"></i>';
        case "água": return '<i class="fas fa-tint"></i>';
        case "ar": return '<i class="fas fa-wind"></i>';
        case "tecnologia": return '<i class="fas fa-microchip"></i>';
        case "luz": return '<i class="fas fa-sun"></i>';
        case "sombra": return '<i class="fas fa-moon"></i>';
        default: return '<i class="fas fa-question"></i>';
    }
}

function showPackOpeningModal(newCards) {
    const modal = document.getElementById('pack-opening-modal');
    const container = document.getElementById('new-cards-display');
    const closeBtn = document.getElementById('closeModalBtn');
    container.innerHTML = ''; 

    newCards.forEach(card => {
        const rarityStyles = getRarityColors(card.rarity);
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card-preview card-small';
        cardDiv.style.backgroundImage = `url('${card.image_url}')`;
        cardDiv.style.borderColor = rarityStyles.primary;
        cardDiv.innerHTML = `
            <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">${card.rarity.substring(0,1)}</div>
            <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white;">${card.power}</div>
        `;
        container.appendChild(cardDiv);
    });
    modal.classList.remove('hidden');
    closeBtn.onclick = () => { modal.classList.add('hidden'); renderAlbum(); };
}

// --- Helpers que você já tinha ---
async function generateCardsForPack(pack) {
    const { data: allCards } = await supabase.from('cards').select('*');
    if(!allCards) return [];
    const cardsByRarity = allCards.reduce((acc, card) => { (acc[card.rarity] = acc[card.rarity] || []).push(card); return acc; }, {});
    const chances = [
        { rarity: 'Comum', chance: pack.chance_comum, cards: cardsByRarity.Comum || [] },
        { rarity: 'Rara', chance: pack.chance_rara, cards: cardsByRarity.Rara || [] },
        { rarity: 'Épica', chance: pack.chance_epica, cards: cardsByRarity.Epica || [] },
        { rarity: 'Lendária', chance: pack.chance_lendaria, cards: cardsByRarity.Lendaria || [] },
        { rarity: 'Mítica', chance: pack.chance_mitica, cards: cardsByRarity.Mítica || [] },
    ];
    const obtainedCards = [];
    for (let i = 0; i < pack.cartas_total; i++) {
        const randomValue = Math.random();
        let cumulativeChance = 0;
        let selectedRarity = null;
        for (const { rarity, chance } of chances) {
            cumulativeChance += chance;
            if (randomValue <= cumulativeChance) { selectedRarity = rarity; break; }
        }
        if (selectedRarity && cardsByRarity[selectedRarity]?.length > 0) {
             const list = cardsByRarity[selectedRarity];
             obtainedCards.push(list[Math.floor(Math.random() * list.length)]);
        }
    }
    return obtainedCards;
}

async function updatePlayerCards(newCards) {
    if (!player || newCards.length === 0) return;
    const updates = newCards.reduce((acc, card) => { acc[card.id] = (acc[card.id] || 0) + 1; return acc; }, {});
    for (const cardId in updates) {
        const quantityGained = updates[cardId];
        const existingCard = cardsInAlbum.find(c => c.id === cardId);
        if (existingCard && existingCard.owned) {
            await supabase.from('cartas_do_jogador').update({ quantidade: existingCard.quantidade + quantityGained }).eq('jogador_id', player.id).eq('card_id', cardId);
        } else {
            await supabase.from('cartas_do_jogador').insert([{ card_id: cardId, jogador_id: player.id, quantidade: quantityGained }]);
        }
    }
    await loadPlayerData(player.id);
}

function getRarityColors(rarity) {
    let primaryColor = "#A9A9A9";
    if(rarity) {
        switch (rarity.toLowerCase()) {
            case "mítica": primaryColor = "#FFD700"; break;
            case "lendária": primaryColor = "#FF8C00"; break;
            case "épica": primaryColor = "#9932CC"; break;
            case "rara": primaryColor = "#1E90FF"; break;
        }
    }
    return { primary: primaryColor };
}

function showNotification(msg, isError) {
    const notif = document.getElementById('notification-area');
    if(notif) {
        notif.textContent = msg;
        notif.className = `notification ${isError ? 'error' : 'success'}`;
        notif.style.display = 'block';
        setTimeout(() => notif.style.display = 'none', 3000);
    }
}

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const sectionId = e.currentTarget.dataset.section;
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.game-section').forEach(sec => sec.classList.add('hidden'));
            e.currentTarget.classList.add('active');
            const section = document.getElementById(sectionId + '-section');
            if(section) section.classList.remove('hidden');
            if(sectionId === 'shop') renderShop();
            if(sectionId === 'album') { currentOriginView = null; renderAlbum(); } // Reseta view ao clicar na aba
        });
    });
}

async function loadOriginCovers() {
    const { data } = await supabase.from('capas_origens').select('*');
    if (data) {
        originCovers = data.reduce((acc, item) => {
            acc[item.origem] = item.image_url; // Mapeia "Marvel" -> URL
            return acc;
        }, {});
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    const btnLogout = document.getElementById('logoutBtn');

    if(btnLogin) btnLogin.addEventListener('click', handleLoginClick);
    if(btnRegister) btnRegister.addEventListener('click', handleRegisterClick);
    if(btnLogout) btnLogout.addEventListener('click', handleLogout);

    setupNavigation();

    supabase.auth.onAuthStateChange((event, session) => {
        updateUIState(session);
    });
});


