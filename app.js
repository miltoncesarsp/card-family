// app.js - VERSÃO COMPLETA (COM PASTAS E EVOLUÇÃO)

// Variáveis Globais
let player = null;
let cardsInAlbum = [];
let allGameCards = []; 
let packsAvailable = [];
let minigameConfig = {}; // Cache das configurações (recompensa/multiplicador)
let evolutionRules = {}; // Regras de evolução (ex: {Comum: 5})
let currentOriginView = null; // Controla em qual pasta estamos
const BUCKET_NAME = 'cards';
let marketCards = [];
let pendingTradeId = null; // Guarda qual troca o usuário clicou
let minigameStatus = {}; // Vai guardar a energia: { battle: 5, memory: 3... }
let targetMaxScale = 50;
let currentMemoryLevel = 0; // 4, 6 ou 8 pares
let puzzleState = {
    gridSize: 3, // Ex: 3x3
    pieces: [], // Array com a ordem atual das peças
    selectedPieceIndex: null, // Qual peça o usuário clicou primeiro
    originalImage: null // URL da carta
};

let battleState = {
    round: 1,
    playerScore: 0,
    enemyScore: 0,
    myHand: [],
    enemyDeck: [],
    enemyName: "Rival",
    isProcessing: false // <--- NOVO: Trava cliques duplos
};

let memoryState = {
    cards: [],
    hasFlippedCard: false,
    lockBoard: false, // Impede clicar em mais de 2 cartas
    firstCard: null,
    secondCard: null,
    matchesFound: 0
};

let targetState = {
    goal: 0,
    current: 0,
    isGameOver: false
};

let jokenpoState = {
    round: 1,
    playerScore: 0,
    cpuScore: 0,
    rules: [], // Vamos carregar do banco
    myDeck: [],
    cpuDeck: [],
    isProcessing: false
};

let dungeonState = {
    lives: 3,
    currentLoot: 0,
    tiles: [],
    isLocked: false,
    combatMonster: null,
    playerHand: [],
    totalTreasures: 0, // <--- NOVO
    foundTreasures: 0  // <--- NOVO
};

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
const { data: playerData, error: playerError } = await supabase
    .from('jogadores')
    // GARANTA QUE ultimo_login está no SELECT (Você já está usando SELECT *)
    .select(`id, email, moedas, total_cartas, nome, ultimo_login, dias_consecutivos`) // Adicionei 'ultimo_login' e 'dias_consecutivos' explicitamente para garantir
    .eq('id', userId)
    .single();

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

    await checkDailyReward(); // Verifica se tem prêmio assim que carrega os dados

// 2. Carrega Regras de Evolução
    await loadEvolutionRules();
    
    // 3. Carrega Configuração de Economia (ADICIONE ISTO AQUI)
    await loadGameConfig();

    // 4. Carrega TODAS as cartas do jogo
    const { data: allCardsData } = await supabase.from('cards').select('*, personagens_base(origem)').order('power', { ascending: true });
    if (allCardsData) allGameCards = allCardsData;

    // 5. Carrega as cartas do Jogador
    const { data: playerCardData } = await supabase
        .from('cartas_do_jogador')
        .select(`quantidade, card_id, is_new`) // <--- MUDANÇA AQUI
        .eq('jogador_id', userId);

    // 6. Cruza os dados
if (allGameCards.length > 0) {
        cardsInAlbum = allGameCards.map(gameCard => {
            // Encontra a carta no inventário do jogador
            const userHas = playerCardData?.find(item => item.card_id === gameCard.id);
            
            // Define a quantidade (se não tiver registro, é 0)
            const qtd = userHas ? userHas.quantidade : 0;

            return {
                ...gameCard,
                quantidade: qtd,
                
                // AQUI ESTÁ A CORREÇÃO: 
                // Só é dono se a quantidade for MAIOR que 0.
                // Se for 0, vira false (carta bloqueada/cinza).
                owned: qtd > 0, 
                
                // Mantém a lógica de novidade
                isNew: userHas ? userHas.is_new : false 
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
    
    const nameEl = document.getElementById('player-name'); 
    const coinsEl = document.getElementById('player-coins');
    const dayEl = document.getElementById('current-day-num'); // O novo elemento

    if (nameEl) {
        // Usa nome ou email se nome vazio
        nameEl.textContent = player.nome || player.email.split('@')[0]; 
    }

    if (coinsEl) {
        // Garante formatação bonita com ícone
        coinsEl.innerHTML = `<i class="fas fa-coins"></i> ${player.moedas}`;
    }
    
    if (dayEl) {
        // Mostra dia consecutivo
        dayEl.textContent = player.dias_consecutivos || 1;
    }
}

async function showDailyRewardsList() {
    const container = document.getElementById('daily-rewards-list');
    const modal = document.getElementById('daily-list-modal');
    
    container.innerHTML = '<p style="color:white;">Carregando...</p>';
    modal.classList.remove('hidden');

    const { data: rewards } = await supabase.from('recompensas_diarias').select('*').order('dia');
    
    if (!rewards) {
        container.innerHTML = '<p style="color:red;">Erro ao carregar.</p>';
        return;
    }

    let html = '';
    const currentDay = player.dias_consecutivos;

    rewards.forEach(r => {
        const isPast = r.dia < currentDay;
        const isToday = r.dia === currentDay;
        
        // Estilo visual
        let style = 'background: #2a2a40; border: 1px solid #444;';
        let icon = r.tipo === 'pacote' ? '📦' : '💰';
        let statusIcon = '';

        if (isPast) {
            style = 'background: #1a1a20; opacity: 0.6; border: 1px solid #333;';
            statusIcon = '✅';
        } else if (isToday) {
            style = 'background: #2a2a40; border: 2px solid #FFD700; box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);';
            statusIcon = '📍 HOJE';
        }

        html += `
            <div style="${style} padding: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; color: white;">
                <div>
                    <strong style="color: ${isToday ? '#FFD700' : '#aaa'}">Dia ${r.dia}</strong>
                    <div style="font-size: 0.9em;">${icon} ${r.descricao}</div>
                </div>
                <div style="font-size: 0.8em; font-weight: bold; color: #2ecc71;">
                    ${statusIcon}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
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
            originsData[origem] = { name: origem, total: 0, owned: 0, cards: [], newCount: 0, evoCount: 0 };
        }
        
        originsData[origem].cards.push(card);
        originsData[origem].total++;
        
        if (card.owned) {
            originsData[origem].owned++;
            
            // Conta se é nova
            if (card.isNew) originsData[origem].newCount++;

            // Conta se pode evoluir
            const cost = evolutionRules[card.rarity] || 999;
            if (card.quantidade >= cost && card.rarity !== 'Mítica') {
                originsData[origem].evoCount++;
            }
        }
    });

    // VISÃO 1: DENTRO DA PASTA (Mostra Cartas Individuais)
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
        // Ordena: Primeiro as Novas, Depois as que podem Evoluir, Depois Raridade
        currentData.cards.sort((a, b) => {
            if (a.isNew && !b.isNew) return -1; // Novas primeiro
            if (!a.isNew && b.isNew) return 1;
            return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
        });

        currentData.cards.forEach(card => {
            const rarityStyles = getRarityColors(card.rarity);
            
            if (card.owned) {
                // Botão Evoluir
                const cost = evolutionRules[card.rarity] || 999;
                let evolutionBtnHTML = '';
                if (card.quantidade >= cost && card.rarity !== 'Mítica') {
                    evolutionBtnHTML = `
                        <div class="evolution-btn" onclick="handleEvolution('${card.id}', '${card.rarity}')">
                            <i class="fas fa-arrow-up"></i> Evoluir
                        </div>
                    `;
                }

                // Selo "NOVO"
                let newBadgeHTML = '';
                if (card.isNew) {
                    newBadgeHTML = `<div class="badge-new-card">NOVO!</div>`;
                }

                const elementStyles = getElementStyles(card.element);

html += `
                <div class="card-preview card-small card-collected" 
                     style="background-image: url('${card.image_url}'); border: 3px solid ${rarityStyles.primary}; cursor: pointer;" 
                     title="${card.name}"
                     onclick="viewBigCard('${card.id}')"> ${newBadgeHTML} ${evolutionBtnHTML}
                    
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
        
        const coverImage = originCovers[data.name]; 
        const bgStyle = coverImage 
            ? `background-image: url('${coverImage}');` 
            : `background: linear-gradient(135deg, #1a1a2e, #16213e);`;
        
        const iconFallback = !coverImage ? `<i class="fas fa-layer-group" style="font-size: 60px; color: rgba(255,255,255,0.1); position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);"></i>` : '';

        // --- NOTIFICAÇÕES ---
        let notificationsHTML = '<div class="folder-notifications">';
        if (data.newCount > 0) {
            notificationsHTML += `<div class="notif-badge-new"><i class="fas fa-exclamation-circle"></i> ${data.newCount} NOVAS</div>`;
        }
        if (data.evoCount > 0) {
            notificationsHTML += `<div class="notif-badge-evo"><i class="fas fa-arrow-up"></i> ${data.evoCount} UPGRADES</div>`;
        }
        notificationsHTML += '</div>';

        // CORREÇÃO AQUI: onclick chama apenas o nome da pasta
        html += `
            <div class="origin-folder" onclick="openOriginView('${data.name}')" style="${bgStyle}">
                ${iconFallback}
                ${notificationsHTML}
                <div class="origin-content-overlay">
                    <div class="origin-name">${data.name}</div>
                    <div class="origin-stats">
                        <i class="fas fa-clone"></i> ${data.owned}/${data.total}
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${percentage}%; background-color: ${barColor};"></div>
                    </div>
                    <div class="percent-text">${percentage}% Completo</div>
                </div>
            </div>
        `;
    }
    html += `</div>`;
    container.innerHTML = html;
}

async function openOriginView(originName) {
    currentOriginView = originName;
    renderAlbum(); // Abre a pasta imediatamente
    window.scrollTo(0,0);

    // Lógica Inteligente: Descobre os IDs das cartas desta pasta
    // Filtra as cartas globais que pertencem a esta origem e que são NOVAS
    const cardsInThisFolder = cardsInAlbum.filter(c => {
        const cOrigin = c.personagens_base ? c.personagens_base.origem : 'Outros';
        return cOrigin === originName && c.isNew === true;
    });

    const cardIdsToUpdate = cardsInThisFolder.map(c => c.id);

    // Se tiver cartas novas para limpar o aviso
if (cardIdsToUpdate.length > 0) {
        // Atualiza no banco (silenciosamente)
        const { error } = await supabase
            .from('cartas_do_jogador')
            .update({ is_new: false })
            .in('card_id', cardIdsToUpdate)
            .eq('jogador_id', player.id);

        if (!error) {
            // 🚨 ADICIONE ESTE BLOCO 🚨
            cardIdsToUpdate.forEach(cardId => {
                // 1. Atualiza localmente a variável (para a próxima renderização)
                const card = cardsInAlbum.find(c => c.id === cardId);
                if (card) card.isNew = false;
                
                // 2. Remove o elemento visual "NOVO!" da DOM
                // Encontra a carta na tela pelo data-card-id (ou seletor equivalente)
                const cardElement = document.querySelector(`.card-preview.card-collected[title="${card.name}"]`);
                if (cardElement) {
                    const newBadge = cardElement.querySelector('.badge-new-card');
                    if (newBadge) {
                        newBadge.remove(); // Remove o selo visual imediatamente
                    }
                }
            });
            // FIM DO BLOCO ADICIONADO
        }
    }
}

function closeOriginView() {
    currentOriginView = null;
    renderAlbum();
}

async function handleEvolution(cardId, rarity) {
    // Impede que o clique abra a visualização da carta (se tiver)
    if(event) event.stopPropagation(); 
    
    const cost = evolutionRules[rarity];
    
    if(!confirm(`✨ EVOLUÇÃO ✨\n\nDeseja fundir ${cost} cartas desta para obter 1 de raridade superior?`)) return;

    // Mostra loading (opcional, ou muda o cursor)
    document.body.style.cursor = 'wait';

    // Chama a função mágica do Banco de Dados
    const { data: newCard, error } = await supabase.rpc('evoluir_carta', { 
        p_card_id: cardId 
    });

    document.body.style.cursor = 'default';

    if (error) {
        // Toca som de erro ou alerta
        alert("❌ Erro na evolução: " + error.message);
    } else {
        // SUCESSO!
        // Toca som de sucesso (opcional)
        
        // Recarrega os dados para atualizar o álbum
        await loadPlayerData(player.id);
        
        // Mostra a nova carta ganha usando o mesmo modal de abrir pacotes!
        // O modal espera um array, então passamos [newCard]
        showPackOpeningModal([newCard], "✨ EVOLUÇÃO COMPLETA! ✨");
        
        showNotification(`Sucesso! Você obteve: ${newCard.name}!`);
    }
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
    const confirmarCompra = await showGameAlert(
        "CONFIRMAR COMPRA", 
        `Deseja comprar este pacote por ${packPrice} moedas?`, 
        true
    );
    if (!confirmarCompra) return;

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

function showPackOpeningModal(newCards, titleOverride = null) {
    const modal = document.getElementById('pack-opening-modal');
    const modalContent = modal.querySelector('.modal-content'); // A caixa branca/escura
    const container = document.getElementById('new-cards-display');
    const closeBtn = document.getElementById('closeModalBtn');
    const titleEl = modal.querySelector('h2');
    
    container.innerHTML = ''; 

    // --- 1. DETECTOR DE SORTE (Para brilhar a janela) ---
    // Remove classes antigas de sorte
    modalContent.classList.remove('luck-legendary', 'luck-mythic');
    titleEl.classList.remove('lucky-title');
    titleEl.style.color = ''; // Reseta cor

    // Verifica se tem cartas raras no pacote
    const hasMythic = newCards.some(c => c.rarity === 'Mítica');
    const hasLegendary = newCards.some(c => c.rarity === 'Lendária');

    // Define Título e Efeito do Modal
    if (hasMythic) {
        modalContent.classList.add('luck-mythic');
        titleEl.textContent = "✨ SORTE MÍTICA! ✨";
        titleEl.style.color = "#FFD700";
        titleEl.classList.add('lucky-title');
    } else if (hasLegendary) {
        modalContent.classList.add('luck-legendary');
        titleEl.textContent = "🔥 SORTE LENDÁRIA! 🔥";
        titleEl.style.color = "#FF8C00";
        titleEl.classList.add('lucky-title');
    } else {
        // Padrão (ou usa o título passado pela evolução)
        titleEl.textContent = titleOverride || "🎁 Pacote Aberto!";
    }

    // --- 2. RENDERIZA AS CARTAS (Com efeitos individuais) ---
    newCards.forEach(card => {
        const rarityStyles = getRarityColors(card.rarity);
        const elementStyles = getElementStyles(card.element);
        const r = card.rarity.toLowerCase();
        
        // Efeitos individuais (Raios)
        let backgroundEffect = '';
        let animationClass = '';

        if (r === 'mítica') {
            backgroundEffect = `<div class="god-rays mythic"></div>`;
            animationClass = 'effect-pulse';
        } else if (r === 'lendária') {
            backgroundEffect = `<div class="god-rays"></div>`;
            animationClass = 'effect-pulse';
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'modal-card-container';
        
        wrapper.innerHTML = `
            ${backgroundEffect}
            
            <div class="card-preview card-small ${animationClass}" 
                 style="background-image: url('${card.image_url}'); 
                        border: 3px solid ${rarityStyles.primary}; 
                        color: ${rarityStyles.primary};">
                
                <div class="card-element-badge" style="background: ${elementStyles.background};">
                    ${getElementIcon(card.element)}
                </div>

                <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">${card.rarity.substring(0,1)}</div>
                
                <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white;">${card.power}</div>
                
                <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
            </div>
        `;
        container.appendChild(wrapper);
    });

    // Abre o modal
    modal.classList.remove('hidden');
    
    // Fecha
    closeBtn.onclick = () => { 
        modal.classList.add('hidden'); 
        // Limpa efeitos ao fechar para não piscar na próxima
        modalContent.classList.remove('luck-legendary', 'luck-mythic');
        renderAlbum(); 
    };
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
            // ATUALIZAÇÃO: Adiciona is_new: true
            await supabase.from('cartas_do_jogador')
                .update({ quantidade: existingCard.quantidade + quantityGained, is_new: true }) 
                .eq('jogador_id', player.id).eq('card_id', cardId);
        } else {
            // INSERÇÃO: Adiciona is_new: true
            await supabase.from('cartas_do_jogador')
                .insert([{ card_id: cardId, jogador_id: player.id, quantidade: quantityGained, is_new: true }]);
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

            // ADICIONE ESTA LINHA SE ELA NÃO ESTIVER LÁ:
            if(sectionId === 'trade') renderTrade(); 
            // Dentro de setupNavigation() ...
                if(sectionId === 'minigames') {
                    refreshMinigameEnergy(); // <--- ADICIONE ISSO
                }
            if(sectionId === 'shop') renderShop();
            if(sectionId === 'album') { currentOriginView = null; renderAlbum(); }
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

// ------------------------------------
// SISTEMA DE RECOMPENSA DIÁRIA
// ------------------------------------

async function checkDailyReward() {
    if (!player) return;

    const SAFE_PAST_DATE = '2000-01-01T00:00:00Z'; 
    const lastLoginTimestamp = player.ultimo_login && player.ultimo_login !== '0' 
        ? player.ultimo_login 
        : SAFE_PAST_DATE;

    const hoje = new Date();
    const ultimoLogin = new Date(lastLoginTimestamp); 
    
    const hojeString = hoje.toISOString().split('T')[0];
    const ultimoLoginString = ultimoLogin.toISOString().split('T')[0]; 
    
    if (hojeString === ultimoLoginString) return; // Já coletou hoje

    // Lógica de Dias
    const dataHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const dataUltimo = new Date(ultimoLogin.getFullYear(), ultimoLogin.getMonth(), ultimoLogin.getDate());
    const diffTempo = dataHoje.getTime() - dataUltimo.getTime();
    const diffDias = Math.floor(diffTempo / (1000 * 60 * 60 * 24)); 
    
    let novosDiasConsecutivos = player.dias_consecutivos;

    if (diffDias === 1) { 
        novosDiasConsecutivos++;
    } else if (diffDias > 1 || diffDias <= 0) { 
        novosDiasConsecutivos = 1; 
    }

    // --- 1. BUSCA RECOMPENSA DO BANCO ---
    const { data: allRewards } = await supabase.from('recompensas_diarias').select('*').order('dia');
    
    if (!allRewards || allRewards.length === 0) return; // Sem dados, aborta

    // Tenta achar o dia exato. Se não tiver (ex: dia 35), pega o último disponível (fallback).
    let rewardData = allRewards.find(r => r.dia === novosDiasConsecutivos);
    if (!rewardData) {
        rewardData = allRewards[allRewards.length - 1]; // Pega o último dia cadastrado (ex: dia 30)
    }

    // Prepara visual do modal
    const modal = document.getElementById('daily-reward-modal');
    const dailyAmountEl = document.getElementById('daily-amount');
    const dailyStreakEl = document.getElementById('daily-streak');
    const msgEl = document.getElementById('daily-message');

    // Define ícone e texto baseado no tipo
    let rewardHTML = '';
    if (rewardData.tipo === 'pacote') {
        rewardHTML = `<i class="fas fa-box-open" style="color:#9b59b6"></i> Pacote!`;
        msgEl.textContent = `Dia Especial! Você ganhou: ${rewardData.descricao}`;
    } else {
        rewardHTML = `<i class="fas fa-coins" style="color:#FFD700"></i> +${rewardData.valor}`;
        msgEl.textContent = rewardData.descricao || "Prêmio Diário!";
    }

    dailyAmountEl.innerHTML = rewardHTML;
    dailyStreakEl.textContent = novosDiasConsecutivos;
    
    modal.classList.remove('hidden');

    // Configura Botão Receber
    const btnCollect = document.getElementById('collectDailyBtn');
    const newBtn = btnCollect.cloneNode(true);
    btnCollect.parentNode.replaceChild(newBtn, btnCollect);

    newBtn.addEventListener('click', async () => {
        newBtn.textContent = "Recebendo...";
        newBtn.disabled = true;
        
        const dataParaSalvar = (new Date()).toISOString();
        let novasMoedas = player.moedas;

        // ENTREGA O PRÊMIO
        if (rewardData.tipo === 'pacote') {
            // Lógica de Pacote: Busca o pacote pelo ID (valor)
            const { data: pack } = await supabase.from('pacotes').select('*').eq('id', rewardData.valor).single();
            if (pack) {
                const newCards = await generateCardsForPack(pack);
                await updatePlayerCards(newCards);
                showPackOpeningModal(newCards, "🎁 BÔNUS DIÁRIO!"); // Abre o pack depois de fechar o diário
            }
        } else {
            // Lógica de Moedas
            novasMoedas += rewardData.valor;
        }

        // Salva Jogador
        const { error } = await supabase
            .from('jogadores')
            .update({ 
                moedas: novasMoedas,
                ultimo_login: dataParaSalvar, 
                dias_consecutivos: novosDiasConsecutivos
            })
            .eq('id', player.id);

        if (!error) {
            player.moedas = novasMoedas;
            player.dias_consecutivos = novosDiasConsecutivos;
            player.ultimo_login = dataParaSalvar;
            
            updateHeaderInfo();
            modal.classList.add('hidden');
            
            if(rewardData.tipo === 'moedas') {
                showNotification(`Recebido: ${rewardData.valor} moedas!`);
            }
        }
    });
}
// =================================================
// SISTEMA DE TROCAS
// =================================================

async function renderTrade() {
    const container = document.getElementById('market-grid');
    const myContainer = document.getElementById('my-trades-container');
    
    container.innerHTML = "Carregando mercado...";
    myContainer.innerHTML = "Carregando...";

    // 1. Busca todos os anúncios do mercado com os dados da carta
    const { data: marketData, error } = await supabase
        .from('mercado')
        .select(`id, vendedor_id, cards (*)`);

    if (error) { console.error(error); return; }

    marketCards = marketData;
    const myId = player.id;

    // Separar o que é meu e o que é dos outros
    const myTrades = marketCards.filter(item => item.vendedor_id === myId);
    const othersTrades = marketCards.filter(item => item.vendedor_id !== myId);

    // --- RENDERIZA MEUS ANÚNCIOS ---
    myContainer.innerHTML = '';
    if (myTrades.length === 0) {
        myContainer.innerHTML = '<p style="color:#aaa">Você não tem cartas anunciadas.</p>';
    } else {
        myTrades.forEach(trade => {
            myContainer.innerHTML += createCardHTML(trade.cards, true, trade.id);
        });
    }

    // --- RENDERIZA MERCADO GLOBAL ---
    container.innerHTML = '';
    if (othersTrades.length === 0) {
        container.innerHTML = '<p style="color:#aaa; width:100%; text-align:center;">Nenhuma oferta no momento.</p>';
    } else {
        othersTrades.forEach(trade => {
            // Envolve num wrapper clicável para trocar
            const cardHTML = createCardHTML(trade.cards, false);
            const wrapper = document.createElement('div');
            wrapper.className = 'market-card-wrapper';
            wrapper.onclick = () => openTradeModal(trade.id);
            wrapper.innerHTML = cardHTML + `<div class="trade-badge">TROCAR</div>`;
            container.appendChild(wrapper);
        });
    }
}

// Função auxiliar para desenhar a carta (reaproveitando estilo)
function createCardHTML(card, isMine, tradeId = null, showQuantity = true) {
    const rarityStyles = getRarityColors(card.rarity);
    const elementStyles = getElementStyles(card.element);
    
    let btnCancel = '';
    if (isMine && tradeId) {
        btnCancel = `<button class="cancel-trade-btn" onclick="cancelTrade('${tradeId}')">Cancelar</button>`;
    }

    // SÓ MOSTRA SE TIVER QUANTIDADE E SE A FLAG showQuantity FOR TRUE
    let quantityHTML = '';
    if (card.quantidade && showQuantity) {
        quantityHTML = `<div class="card-quantity">x${card.quantidade}</div>`;
    }

    return `
        <div class="card-preview card-small" style="background-image: url('${card.image_url}'); border-color: ${rarityStyles.primary}; position: relative;">
            
            ${quantityHTML}

            <div class="card-element-badge" style="background: ${elementStyles.background};">
                ${getElementIcon(card.element)}
            </div>
            
            <div class="rarity-badge" style="background-color: ${rarityStyles.primary};">${card.rarity.substring(0,1)}</div>
            <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${card.power}</div>
            <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
            
            ${btnCancel}
        </div>
    `;
}

// --- AÇÕES DE TROCA ---

// 1. Anunciar (Abre prompt simples por enquanto, ideal seria um modal)
document.getElementById('btnCreateTrade')?.addEventListener('click', async () => {
    // Pega cartas que o jogador tem (carregadas no loadPlayerData)
    // Filtra só as que tem quantidade > 0
    const myAvailableCards = cardsInAlbum.filter(c => c.quantidade > 0);
    
    if (myAvailableCards.length === 0) {
        alert("Você não tem cartas para trocar!");
        return;
    }

    // Abre o modal de oferta, mas configurado para "ANUNCIAR"
    openSelectionModal(myAvailableCards, async (selectedCardId) => {
        const confirmarVenda = await showGameAlert(
            "ANUNCIAR CARTA?",
            "Esta carta sairá da sua coleção até alguém trocar ou você cancelar.",
            true
        );
        if(!confirmarVenda) return;
        
        const { error } = await supabase.rpc('anunciar_carta', { carta_id_para_venda: selectedCardId });
        
        if (error) alert("Erro: " + error.message);
        else {
            alert("Carta anunciada!");
            await loadPlayerData(player.id); // Recarrega inventário
            renderTrade(); // Recarrega tela de trocas
        }
    });
});

// 2. Cancelar Anúncio
async function cancelTrade(tradeId) {
   const confirmarCancel = await showGameAlert(
        "CANCELAR?",
        "Deseja remover o anúncio e pegar a carta de volta?",
        true
    );
    if(!confirmarCancel) return;
    
    const { error } = await supabase.rpc('cancelar_anuncio', { anuncio_id: tradeId });
    
    if(error) alert("Erro: " + error.message);
    else {
        await loadPlayerData(player.id);
        renderTrade();
    }
}

// 3. Abrir Modal para TROCAR (Eu quero a carta X, dou a Y)
function openTradeModal(tradeId) {
    pendingTradeId = tradeId;
    const myAvailableCards = cardsInAlbum.filter(c => c.quantidade > 0);
    
    openSelectionModal(myAvailableCards, async (myCardId) => {
        const confirmarTroca = await showGameAlert(
            "TROCAR?",
            "Trocar sua carta selecionada pela carta do mercado?",
            true
        );
        if(!confirmarTroca) return;
        
        const { error } = await supabase.rpc('realizar_troca', { 
            anuncio_id: pendingTradeId, 
            minha_carta_oferta_id: myCardId 
        });

        if(error) alert("Erro na troca: " + error.message);
        else {
            showNotification("Troca realizada com sucesso! 🎉");
            await loadPlayerData(player.id);
            renderTrade();
        }
    });
}

// Função genérica para mostrar modal de seleção de cartas
function openSelectionModal(cardsList, callback) {
    const modal = document.getElementById('trade-offer-modal');
    const grid = document.getElementById('my-offer-grid');
    grid.innerHTML = '';

    cardsList.forEach(card => {
        const div = document.createElement('div');
        div.innerHTML = createCardHTML(card, false);
        div.style.cursor = 'pointer';
        div.onclick = () => {
            modal.classList.add('hidden');
            callback(card.id);
        };
        grid.appendChild(div);
    });

    modal.classList.remove('hidden');
}

function closeTradeModal() {
    document.getElementById('trade-offer-modal').classList.add('hidden');
}

// =================================================
// MINIGAMES: BATALHA (MELHOR DE 3)
// =================================================

function startBattleGame() {
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('battle-arena').classList.remove('hidden');
    
    // --- ESTADO INICIAL LIMPO ---
    document.getElementById('battle-game-area').classList.add('hidden'); // Esconde a mesa
    document.getElementById('btnStartBattle').classList.remove('hidden'); // Mostra o botão Buscar
    document.getElementById('battle-status').textContent = "Encontre um oponente...";
    document.getElementById('battle-status').style.color = "#FFD700";
    
    // Zera placar visual
    document.getElementById('score-player').textContent = '0';
    document.getElementById('score-enemy').textContent = '0';
    document.getElementById('current-round').textContent = '1 / 3';
    document.getElementById('enemy-name-display').textContent = 'RIVAL';
    
    resetUI(); // Limpa slots internos
}

function exitGame() {
    document.getElementById('games-menu').classList.remove('hidden');
    document.getElementById('battle-arena').classList.add('hidden');
}

function resetUI() {
    const handContainer = document.getElementById('player-hand');
    const playerSlot = document.getElementById('player-slot');
    const enemySlot = document.getElementById('enemy-slot');
    
    // Limpa a mão e slots
    if(handContainer) handContainer.innerHTML = '';
    
    if(playerSlot) {
        playerSlot.removeAttribute('style');
        playerSlot.innerHTML = '<div class="slot-placeholder">Sua Carta</div>';
        playerSlot.className = 'card-slot empty';
    }
    if(enemySlot) {
        enemySlot.removeAttribute('style');
        enemySlot.innerHTML = '<div class="card-back-pattern"></div>';
        enemySlot.className = 'card-slot empty';
    }
    
    // Reseta placar visualmente
    const scoreP = document.getElementById('score-player');
    const scoreE = document.getElementById('score-enemy');
    const roundEl = document.getElementById('current-round');
    const enemyName = document.getElementById('enemy-name-display');

    if(scoreP) scoreP.textContent = '0';
    if(scoreE) scoreE.textContent = '0';
    if(roundEl) roundEl.textContent = '1 / 3';
    if(enemyName) enemyName.textContent = 'RIVAL';

    // Limpa indicadores de força
    const pPower = document.getElementById('player-battle-power');
    const cPower = document.getElementById('cpu-battle-power');
    
    if(pPower) {
        pPower.textContent = '?';
        pPower.classList.remove('winner');
    }
    if(cPower) {
        cPower.textContent = '?';
        cPower.classList.remove('winner');
    }

    // --- CORREÇÃO: NÃO ESCONDER MAIS A MÃO AQUI ---
    // A lógica de esconder/mostrar agora é feita pelo #battle-game-area
}

async function initBattleMatch() {
    // 1. Verifica Cartas
    const myPlayableCards = cardsInAlbum.filter(c => c.owned);
    if (myPlayableCards.length < 5) {
        showNotification("Você precisa de pelo menos 5 cartas!", true);
        return;
    }

    // 2. COBRANÇA DE ENERGIA
    if (!await checkAndSpendEnergy('battle')) return;

    // 3. Setup Visual (AQUI MUDA)
const btnStart = document.getElementById('btnStartBattle');
    const battleStatus = document.getElementById('battle-status');
    
    btnStart.classList.add('hidden'); // Some botão buscar
    
    // Mostra a área do jogo
    document.getElementById('battle-game-area').classList.remove('hidden'); 
    
    // 🚨 GARANTIA EXTRA: Força a mão a aparecer (caso o CSS antigo tenha escondido)
    const handContainerDiv = document.querySelector('#battle-arena .player-hand-container');
    if(handContainerDiv) handContainerDiv.classList.remove('hidden');
    
    battleState.isProcessing = false;
    
    if (battleStatus) {
        battleStatus.textContent = "Buscando oponente...";
        battleStatus.style.color = "#FFD700";
    }

    // ... (O RESTO DA FUNÇÃO CONTINUA IGUAL AO QUE VOCÊ JÁ TINHA) ...
    // 4. Sorteia Mão do Jogador...
    const shuffled = [...myPlayableCards].sort(() => 0.5 - Math.random());
    battleState.myHand = shuffled.slice(0, 5);

    const { data: enemyData, error: enemyError } = await supabase.rpc('buscar_oponente_batalha');
    
    if (enemyError) {
        showNotification("Erro ao achar oponente.", true);
        // Se der erro, volta ao estado inicial
        document.getElementById('battle-game-area').classList.add('hidden');
        btnStart.classList.remove('hidden');
        return;
    }

    battleState.enemyName = enemyData.nome;
    battleState.enemyDeck = [...enemyData.cartas].sort(() => 0.5 - Math.random());

    battleState.round = 1;
    battleState.playerScore = 0;
    battleState.enemyScore = 0;

    const enemyNameDisplay = document.getElementById('enemy-name-display');
    if (enemyNameDisplay) enemyNameDisplay.textContent = battleState.enemyName.toUpperCase();
    
    updateRoundDisplay();
    renderPlayerHand(); 
    
    if (battleStatus) battleStatus.textContent = "Sua vez! Escolha uma carta.";
}

function updateRoundDisplay() {
    document.getElementById('current-round').textContent = `${battleState.round} / 3`;
    document.getElementById('score-player').textContent = battleState.playerScore;
    document.getElementById('score-enemy').textContent = battleState.enemyScore;
}

function renderPlayerHand() {
    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = '';

    battleState.myHand.forEach((card, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'hand-card-wrapper';
        
        // Gera o HTML
        wrapper.innerHTML = createCardHTML(card, false, null, false); 

        // --- CORREÇÃO AQUI ---
        // Antes estava: wrapper.firstElementChild
        // Agora é: wrapper (o elemento pai que tem a classe hand-card-wrapper)
        wrapper.onclick = () => playRound(card, wrapper); 
        
        handContainer.appendChild(wrapper);
    });
}

async function playRound(playerCard, cardElement) {
    // 1. BLOQUEIO DE SEGURANÇA
    if (battleState.isProcessing || cardElement.classList.contains('played')) return;
    
    battleState.isProcessing = true;
    cardElement.classList.add('played'); // Carta fica cinza na mão

    // 2. Renderiza as cartas na mesa
    renderCardInSlot(playerCard, 'player-slot');
    
    // Garante que o inimigo comece com o verso
    const enemySlot = document.getElementById('enemy-slot');
    enemySlot.removeAttribute('style'); // Garante limpeza
    enemySlot.className = 'card-slot empty';
    enemySlot.innerHTML = '<div class="card-back-pattern"></div>'; 
    
    // Pega a carta do inimigo
    const enemyCard = battleState.enemyDeck[battleState.round - 1];

    await new Promise(r => setTimeout(r, 600)); // Suspense

    // 3. Revela Carta do Inimigo
    renderCardInSlot(enemyCard, 'enemy-slot');

    // 4. EFEITO DE IMPACTO (CLASH)
    const pSlot = document.getElementById('player-slot');
    const eSlot = document.getElementById('enemy-slot');
    
    pSlot.classList.add('clash-player');
    eSlot.classList.add('clash-enemy');
    
    await new Promise(r => setTimeout(r, 300)); // Impacto!

    // 5. Resolve a lógica
    await resolveRound(playerCard, enemyCard);

    // Remove classes de animação
    pSlot.classList.remove('clash-player');
    eSlot.classList.remove('clash-enemy');

    // 6. Limpeza e Preparação
    await new Promise(r => setTimeout(r, 1500)); // Tempo para ver quem ganhou

    // Limpa classes de vitória/derrota
    if(pSlot) pSlot.classList.remove('win', 'lose');
    if(eSlot) eSlot.classList.remove('win', 'lose');

    const pPowerEl = document.getElementById('player-battle-power');
    const cPowerEl = document.getElementById('cpu-battle-power');
    
    // Limpa os números de força
    if(pPowerEl) {
        pPowerEl.classList.remove('winner');
        pPowerEl.textContent = '?';
    }
    if(cPowerEl) {
        cPowerEl.classList.remove('winner');
        cPowerEl.textContent = '?';
    }

    // === AQUI ESTÁ A CORREÇÃO VISUAL ===
    // Limpa visualmente os slots removendo a imagem de fundo
    if(pSlot) {
        pSlot.removeAttribute('style'); // <--- TIRA A CARTA ESTICADA
        pSlot.innerHTML = '<div class="slot-placeholder">Sua Carta</div>';
        pSlot.className = 'card-slot empty';
    }
    if(eSlot) {
        eSlot.removeAttribute('style'); // <--- TIRA A CARTA ESTICADA
        eSlot.innerHTML = '<div class="card-back-pattern"></div>';
        eSlot.className = 'card-slot empty';
    }

    // 7. Lógica de Próxima Rodada
    if (battleState.round < 3) {
        battleState.round++;
        updateRoundDisplay();
        const statusEl = document.getElementById('battle-status');
        if(statusEl) {
            statusEl.textContent = "Escolha sua próxima carta...";
            statusEl.style.color = "#FFD700";
        }
        battleState.isProcessing = false; // Libera o clique
    } else {
        finishBattle();
    }
}
async function resolveRound(myCard, cpuCard) {
    const pPower = myCard.power;
    const cPower = cpuCard.power;
    
    const statusEl = document.getElementById('battle-status');
    const playerSlot = document.getElementById('player-slot');
    const enemySlot = document.getElementById('enemy-slot');
    
    // Captura os elementos de força com segurança
    const pPowerEl = document.getElementById('player-battle-power');
    const cPowerEl = document.getElementById('cpu-battle-power');

    // Só tenta mudar o texto se o elemento existir
    if(pPowerEl) pPowerEl.textContent = pPower;
    if(cPowerEl) cPowerEl.textContent = cPower;

    const arena = document.querySelector('.arena-container');
    if(arena) {
        arena.classList.add('shake-hit');
        setTimeout(() => arena.classList.remove('shake-hit'), 500);
    }

    if (pPower > cPower) {
        // VITÓRIA
        if(statusEl) {
            statusEl.textContent = "RODADA VENCIDA!";
            statusEl.style.color = "#2ecc71";
        }
        if(playerSlot) playerSlot.classList.add('win');
        if(enemySlot) enemySlot.classList.add('lose');
        
        // --- AQUI DAVA ERRO ---
        if(pPowerEl) pPowerEl.classList.add('winner'); 
        
        battleState.playerScore++;

    } else if (pPower < cPower) {
        // DERROTA
        if(statusEl) {
            statusEl.textContent = "RODADA PERDIDA!";
            statusEl.style.color = "#e74c3c";
        }
        if(enemySlot) enemySlot.classList.add('win');
        if(playerSlot) playerSlot.classList.add('lose');
        
        // --- AQUI DAVA ERRO ---
        if(cPowerEl) cPowerEl.classList.add('winner');
        
        battleState.enemyScore++;

    } else {
        // EMPATE
        if(statusEl) {
            statusEl.textContent = "EMPATE!";
            statusEl.style.color = "#f1c40f";
        }
    }

    updateRoundDisplay();
}
async function finishBattle() {
    let msg = "";
    let prize = 0;
    
    // --- MUDANÇA AQUI: LER DO ADMIN ---
    // Busca a configuração ou usa 150 como padrão se der erro
    const config = minigameConfig['battle'] || { reward: 150, multi: 1.0 };
    const WIN_PRIZE = Math.floor(config.reward * config.multi);
    // ----------------------------------

    if (battleState.playerScore > battleState.enemyScore) {
        msg = "VITÓRIA! 🏆";
        prize = WIN_PRIZE; // Agora usa o valor do Admin!
        await supabase.rpc('atualizar_moedas_jogo', { qtd: prize });
        player.moedas += prize;
        showNotification(`PARABÉNS! Você ganhou +${prize} moedas!`);
    } else if (battleState.playerScore < battleState.enemyScore) {
        msg = "DERROTA 💀";
    } else {
        msg = "EMPATE 🤝";
    }
    
    updateHeaderInfo();

    setTimeout(async () => {
        // 🚨 SUBSTIUIÇÃO AQUI
        await showGameAlert("FIM DE JOGO!", `${msg}\nPlacar: ${battleState.playerScore} x ${battleState.enemyScore}`);
        
        resetUI();
        exitGame();
        battleState.isProcessing = false;
    }, 500);
}

// Helper universal para desenhar carta em slots (Alvo, Mesa de Batalha, Jokenpo, Monstro)
function renderCardInSlot(card, slotId) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    const rarityStyles = getRarityColors(card.rarity);
    const elementStyles = getElementStyles(card.element);
    
    // Aplica estilos base
    slot.className = 'card-preview card-small';
    slot.style.backgroundImage = `url('${card.image_url}')`;
    slot.style.border = `3px solid ${rarityStyles.primary}`;
    slot.style.color = rarityStyles.primary; // Para herança de cor
    
    // Monta o HTML COMPLETO (igual ao do álbum)
    slot.innerHTML = `
        <div class="card-element-badge" style="background: ${elementStyles.background};">
            ${getElementIcon(card.element)}
        </div>
        
        <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">
            ${card.rarity.substring(0,1)}
        </div>

        <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">
            ${card.power}
        </div>
        
        <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">
            ${card.name}
        </div>
    `;
}

document.addEventListener("DOMContentLoaded", () => {
    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    const btnLogout = document.getElementById('logoutBtn');

    if(btnLogin) btnLogin.addEventListener('click', handleLoginClick);
    if(btnLogout) btnLogout.addEventListener('click', handleLogout);

    setupNavigation();

    supabase.auth.onAuthStateChange((event, session) => {
        updateUIState(session);
    });
});

// --- SISTEMA DE ENERGIA DOS MINIGAMES ---

// 1. Carrega e Atualiza a Energia Visualmente
async function refreshMinigameEnergy() {
    // Chama a função do banco que calcula regeneração
    const { data, error } = await supabase.rpc('sincronizar_energia');
    
    if (data) {
        minigameStatus = data;
        // Atualiza o texto na tela (ex: ⚡ 5/5)
        const games = ['battle', 'memory', 'target', 'dungeon', 'puzzle', 'jokenpo'];
        games.forEach(game => {
            const el = document.getElementById(`energy-${game}`);
            if (el && minigameStatus[game]) {
                const qtd = minigameStatus[game].energia;
                el.innerHTML = `⚡ ${qtd}/5`;
                
                // Muda cor se estiver vazio
                if(qtd === 0) el.style.color = "#e74c3c"; // Vermelho
                else el.style.color = "#FFD700"; // Dourado
            }
        });
    }
}

// 2. Tenta Jogar (Hub Central)
async function attemptPlay(gameType) {
    // --- 1. VERIFICAÇÃO SE O JOGO EXISTE ---
    const jogosProntos = ['battle', 'memory', 'target', 'puzzle', 'jokenpo', 'dungeon'];
    if (!jogosProntos.includes(gameType)) {
        await showGameAlert("EM BREVE 🚧", "Este jogo ainda está em construção.\nGuarde sua energia!");
        return; 
    }

    // --- 2. VERIFICAÇÃO DE ENERGIA (Visual) ---
    if (minigameStatus[gameType] && minigameStatus[gameType].energia <= 0) {
        showNotification("Sem energia! Espere regenerar (1 a cada 2h).", true);
        return;
    }

    // --- 3. ROTEADOR DE JOGOS ---
    // Jogos com MENU (Puzzle e Memória) NÃO cobram aqui. Cobram no 'init'.
    // Jogos DIRETOS (Batalha, Alvo, Jokenpo, Masmorra) cobram aqui.

// ROTEADOR DE JOGOS (Ajustado)
switch (gameType) {
        case 'battle':
            // Batalha cobra na hora (MANTIDO)
            if(await checkAndSpendEnergy('battle')) startBattleGame();
            break;
            
        case 'memory':
            startMemoryGame(); // Menu
            break;
            
        case 'puzzle':
            startPuzzleGame(); // Menu
            break;
            
        case 'jokenpo':
             // Jokenpo cobra ao buscar (MANTIDO - ajustamos isso antes)
             startJokenpoGame(); 
             break;
             
        // --- ALTERAÇÃO AQUI: ALVO E MASMORRA AGORA SÃO DIRETOS (SEM COBRANÇA INICIAL) ---
        case 'target':
            startTargetGame(); 
            break;
            
        case 'dungeon':
             startDungeonGame();
             break;
    }
}

// Função Auxiliar para gastar energia (crie se não tiver)
async function checkAndSpendEnergy(gameType) {
    // Verifica se tem energia localmente antes de ir ao banco
    if (minigameStatus[gameType] && minigameStatus[gameType].energia <= 0) {
        showNotification("Sem energia! Espere regenerar.", true);
        return false;
    }

    // Tenta cobrar no banco
    const { data: sucesso } = await supabase.rpc('gastar_energia_minigame', { tipo_jogo: gameType });
    
    if(sucesso) {
        // Se deu certo, atualiza o visual localmente
        minigameStatus[gameType].energia--;
        refreshMinigameEnergy();
        return true; // Pode jogar
    } else {
        showNotification("Erro de energia.", true);
        return false; // Não pode jogar
    }
}

// =================================================
// MINIGAME: MEMÓRIA
// =================================================

// 1. Abre o Menu de Dificuldade (Não inicia o jogo direto)
function startMemoryGame() {
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('memory-arena').classList.remove('hidden');
    
    // Mostra o Menu, Esconde o Tabuleiro
    document.getElementById('memory-difficulty-menu').classList.remove('hidden');
    document.getElementById('memory-game-board').classList.add('hidden');
}

// 2. Inicia o Jogo com Nível Escolhido
async function initMemoryGame(pairsCount) {
    let pool = cardsInAlbum.filter(c => c.owned);

    // Verifica se tem cartas suficientes
    if (pool.length < pairsCount) {
        await showGameAlert("FALTAM CARTAS", `Você precisa de pelo menos ${pairsCount} cartas na coleção para este nível!`);
        return;
    }

    // --- COBRANÇA DE ENERGIA ---
    // Tenta gastar energia. Se não conseguir, para a função.
    const pagou = await checkAndSpendEnergy('memory');
    if (!pagou) return;
    // ---------------------------

    // Configura o Jogo
    currentMemoryLevel = pairsCount;
    
    // Troca visual: Some Menu, Aparece Jogo
    document.getElementById('memory-difficulty-menu').classList.add('hidden');
    document.getElementById('memory-game-board').classList.remove('hidden');
    document.getElementById('memory-score').textContent = `0 / ${pairsCount}`;

    const grid = document.getElementById('memory-grid');
    grid.innerHTML = 'Carregando...';

    // Configura Grid CSS
    if (pairsCount === 8) grid.style.gridTemplateColumns = "repeat(4, 1fr)";
    else if (pairsCount === 6) grid.style.gridTemplateColumns = "repeat(4, 1fr)"; // 4x3 (ou 3x4 no mobile via CSS)
    else grid.style.gridTemplateColumns = "repeat(4, 1fr)"; // 4x2

    // Reseta Lógica
    memoryState = {
        cards: [], hasFlippedCard: false, lockBoard: false,
        firstCard: null, secondCard: null, matchesFound: 0
    };

    // Sorteia Cartas
    pool.sort(() => 0.5 - Math.random());
    const selected = pool.slice(0, pairsCount);
    
    // Duplica e Embaralha
    let gameCards = [...selected, ...selected].map((card, index) => ({ ...card, tempId: index }));
    gameCards.sort(() => 0.5 - Math.random());

    // Renderiza
    grid.innerHTML = '';
    gameCards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.classList.add('memory-card');
        cardEl.dataset.cardId = card.id;
        
        cardEl.innerHTML = `
            <div class="memory-front" style="background-image: url('${card.image_url}'); border-color: ${getRarityColors(card.rarity).primary}"></div>
            <div class="memory-back"></div>
        `;
        cardEl.addEventListener('click', () => flipCard(cardEl));
        grid.appendChild(cardEl);
    });
}

function flipCard(cardElement) {
    if (memoryState.lockBoard) return;
    if (cardElement === memoryState.firstCard) return;
    if (cardElement.classList.contains('flipped')) return;

    cardElement.classList.add('flipped');

    if (!memoryState.hasFlippedCard) {
        memoryState.hasFlippedCard = true;
        memoryState.firstCard = cardElement;
        return;
    }

    memoryState.secondCard = cardElement;
    checkForMatch();
}

function checkForMatch() {
    let isMatch = memoryState.firstCard.dataset.cardId === memoryState.secondCard.dataset.cardId;
    isMatch ? disableCards() : unflipCards();
}

function disableCards() {
    memoryState.matchesFound++;
    document.getElementById('memory-score').textContent = `${memoryState.matchesFound} / ${currentMemoryLevel}`;
    resetBoard();

    // Vitória
    if (memoryState.matchesFound === currentMemoryLevel) {
        setTimeout(finishMemoryGame, 500);
    }
}

function unflipCards() {
    memoryState.lockBoard = true;
    setTimeout(() => {
        memoryState.firstCard.classList.remove('flipped');
        memoryState.secondCard.classList.remove('flipped');
        resetBoard();
    }, 1000);
}

function resetBoard() {
    [memoryState.hasFlippedCard, memoryState.lockBoard] = [false, false];
    [memoryState.firstCard, memoryState.secondCard] = [null, null];
}

async function finishMemoryGame() {
    // Busca config do nível jogado
    const configKey = `memory_${currentMemoryLevel}`;
    const config = minigameConfig[configKey] || { reward: 30, multi: 1 };
    const prize = Math.floor(config.reward * config.multi);

    await supabase.rpc('atualizar_moedas_jogo', { qtd: prize });
    player.moedas += prize;
    updateHeaderInfo();
    
    showNotification(`VITÓRIA! +${prize} moedas!`);
    
    setTimeout(async () => {
        await showGameAlert("PARABÉNS! 🧠", `Você completou o nível ${currentMemoryLevel} pares!\nGanhou ${prize} moedas.`);
        resetMemoryMenu(); 
    }, 300);
}

function resetMemoryMenu() {
    document.getElementById('memory-difficulty-menu').classList.remove('hidden');
    document.getElementById('memory-game-board').classList.add('hidden');
}

function quitMemoryGame() {
    document.getElementById('memory-arena').classList.add('hidden');
    document.getElementById('games-menu').classList.remove('hidden');
    refreshMinigameEnergy();
}

// =================================================
// MINIGAME: O ALVO (BLACKJACK VISUAL)
// =================================================

async function startTargetGame() { 
    const myDeck = cardsInAlbum.filter(c => c.owned);
    
    if (myDeck.length === 0) {
        await showGameAlert("SEM CARTAS", "Você precisa de cartas na coleção para jogar!");
        return;
    }

    // ... (Cálculos de média e alvo continuam iguais) ...
    const totalPower = myDeck.reduce((sum, card) => sum + card.power, 0);
    const avgPower = Math.ceil(totalPower / myDeck.length);
    const minTarget = avgPower * 3;
    const maxTarget = avgPower * 5;
    targetState.goal = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
    targetMaxScale = Math.ceil(targetState.goal * 1.3);

    // UI Setup
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('target-arena').classList.remove('hidden');
    
    // --- AJUSTE DOS BOTÕES ---
    document.getElementById('btn-hit').classList.remove('hidden'); // Botão Jogar
    document.getElementById('btn-stand').classList.add('hidden');    // Esconde Parar
    document.getElementById('btn-target-exit').classList.remove('hidden'); // Mostra Sair
    // -------------------------
    
    const cardSlot = document.getElementById('target-card-display');
    cardSlot.innerHTML = '<div class="card-back-pattern"></div>';
    cardSlot.style.backgroundImage = ''; 
    cardSlot.className = 'card-slot empty';

    targetState.current = 0;
    targetState.isGameOver = false;
    targetState.firstMove = true; 

    // Renderiza
    document.getElementById('target-goal').textContent = targetState.goal;
    document.getElementById('target-current').textContent = '0';

    const linePercent = (targetState.goal / targetMaxScale) * 100;
    document.getElementById('target-line').style.bottom = `${linePercent}%`;

    const liquid = document.getElementById('target-liquid');
    liquid.style.height = '0%';
    liquid.className = 'target-liquid-fill';
}

async function targetHit() { 
    if (targetState.isGameOver) return;

    // --- COBRANÇA DE ENERGIA ---
    if (targetState.firstMove) {
        const pagou = await checkAndSpendEnergy('target');
        if (!pagou) return; 
        
        targetState.firstMove = false; 
        
        // --- AQUI A MÁGICA: TROCA OS BOTÕES ---
        document.getElementById('btn-stand').classList.remove('hidden'); // Mostra Parar
        document.getElementById('btn-target-exit').classList.add('hidden'); // Esconde Sair
        // --------------------------------------
    }
    // ----------------------------------------------

    const myDeck = cardsInAlbum.filter(c => c.owned);
    const randomCard = myDeck[Math.floor(Math.random() * myDeck.length)];
    
    renderCardInSlot(randomCard, 'target-card-display');

    targetState.current += randomCard.power;
    document.getElementById('target-current').textContent = targetState.current;

    let fillPercent = (targetState.current / targetMaxScale) * 100;
    if (fillPercent > 100) fillPercent = 100; 
    
    const liquid = document.getElementById('target-liquid');
    liquid.style.height = `${fillPercent}%`;

    if (targetState.current >= targetState.goal - (targetState.goal * 0.15)) { 
        liquid.classList.add('danger');
    }

    if (targetState.current > targetState.goal) {
        liquid.classList.remove('danger');
        liquid.classList.add('exploded');
        endTargetGame(false);
    } else if (targetState.current === targetState.goal) {
        endTargetGame(true);
    }
}

function targetStand() {
    if (targetState.isGameOver) return;
    // O jogador decidiu parar. Vamos ver quão perto chegou.
    endTargetGame(true);
}

async function endTargetGame(survived) {
    targetState.isGameOver = true;
    document.getElementById('btn-hit').classList.add('hidden');
    document.getElementById('btn-stand').classList.add('hidden');
    
    let prize = 0;
    let message = "";
    let title = "";

    if (!survived) {
        title = "QUEBROU! 💥";
        message = "O tubo estourou. Você foi ganancioso e perdeu tudo!";
    } else {
        // --- LÓGICA PROPORCIONAL ---
        // 1. Pega o prêmio máximo do Admin (Ex: 300)
        const config = minigameConfig['target'] || { reward: 150, multi: 1.0 };
        const maxPrize = Math.floor(config.reward * config.multi);

        // 2. Calcula a porcentagem atingida (Valor Atual / Meta)
        // Ex: Meta 100, Parei em 50 -> 0.5 (50%)
        const percentageReached = targetState.current / targetState.goal;
        
        // 3. Calcula o prêmio (Máximo * Porcentagem)
        // Ex: 300 * 0.5 = 150 moedas
        prize = Math.floor(maxPrize * percentageReached);

        // Define mensagens baseadas na proximidade (apenas cosmético)
        if (percentageReached === 1) {
            title = "PERFEITO! 🎯";
            message = `Na mosca! 100% do prêmio: +${prize} moedas!`;
        } else if (percentageReached >= 0.9) {
            title = "EXCELENTE! 🔥";
            message = `Quase lá! Você garantiu +${prize} moedas.`;
        } else if (percentageReached >= 0.5) {
            title = "BOM! 👍";
            message = `Você parou na metade do caminho. Ganhou +${prize} moedas.`;
        } else {
            title = "FRACO... 😐";
            message = `Parou muito cedo! Ganhou apenas +${prize} moedas.`;
        }

        // 4. Paga
        if (prize > 0) {
            await supabase.rpc('atualizar_moedas_jogo', { qtd: prize });
            player.moedas += prize;
            updateHeaderInfo();
            showNotification(`+${prize} Moedas!`);
        }
    }

    setTimeout(async () => {
        await showGameAlert(title, message);
        document.getElementById('btn-target-exit').classList.remove('hidden');
    }, 500);
}

function quitTargetGame() {
    document.getElementById('target-arena').classList.add('hidden');
    document.getElementById('games-menu').classList.remove('hidden');
    refreshMinigameEnergy();
}

// =================================================
// MINIGAME: PUZZLE (QUEBRA-CABEÇA)
// =================================================

async function startPuzzleGame() { // 🚨 Adicione 'async'
    const myDeck = cardsInAlbum.filter(c => c.owned);
    
    // 🚨 SUBSTIUIÇÃO AQUI
    if (myDeck.length === 0) {
        await showGameAlert("SEM CARTAS", "Você precisa de cartas na coleção para jogar!");
        return;
    }

    // 2. Prepara UI
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('puzzle-arena').classList.remove('hidden');
    
    // Mostra menu de dificuldade, esconde tabuleiro
    document.getElementById('puzzle-difficulty-menu').classList.remove('hidden');
    document.getElementById('puzzle-board-container').classList.add('hidden');
}

async function initPuzzle(size) { // <--- 1. Adicione ASYNC aqui
    const myDeck = cardsInAlbum.filter(c => c.owned);

    // Validação de Cartas
    if (myDeck.length === 0) {
        await showGameAlert("SEM CARTAS", "Você precisa de cartas na coleção para jogar!");
        return;
    }

    // --- 2. COBRANÇA DE ENERGIA ---
    // Tenta gastar energia. Se não conseguir (sem saldo ou erro), para a função.
    const pagou = await checkAndSpendEnergy('puzzle');
    if (!pagou) return; 
    // ------------------------------

    puzzleState.gridSize = size;
    
    // Escolhe carta aleatória da coleção
    const randomCard = myDeck[Math.floor(Math.random() * myDeck.length)];
    puzzleState.originalImage = randomCard.image_url;

    // Setup Visual
    document.getElementById('puzzle-difficulty-menu').classList.add('hidden');
    document.getElementById('puzzle-board-container').classList.remove('hidden');
    document.getElementById('puzzle-target-img').src = puzzleState.originalImage;

    // Cria as peças
    const totalPieces = size * size;
    puzzleState.pieces = [];

    for (let i = 0; i < totalPieces; i++) {
        puzzleState.pieces.push(i);
    }

    // Embaralha
    puzzleState.pieces.sort(() => 0.5 - Math.random());
    puzzleState.selectedPieceIndex = null;
    
    renderPuzzleBoard();
}

function renderPuzzleBoard() {
    const grid = document.getElementById('puzzle-grid');
    grid.innerHTML = '';
    grid.classList.remove('solved'); 

    grid.style.gridTemplateColumns = `repeat(${puzzleState.gridSize}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${puzzleState.gridSize}, 1fr)`;

    const size = puzzleState.gridSize;

    puzzleState.pieces.forEach((originalIndex, currentIndex) => {
        const piece = document.createElement('div');
        piece.className = 'puzzle-piece';
        
        // 1. VERIFICA SE ESTÁ NO LUGAR CERTO
        const isCorrect = originalIndex === currentIndex;

        if (isCorrect) {
            piece.classList.add('correct');
            // Se acabou de ser trocada (opcional, mas legal visualmente)
            // Adicionamos a classe de animação apenas se não estivermos iniciando o jogo
            // Mas para simplificar, o estilo .correct já ajuda muito
        }

        // Se for a peça selecionada (e não estiver correta)
        if (currentIndex === puzzleState.selectedPieceIndex && !isCorrect) {
            piece.classList.add('selected');
        }

        const row = Math.floor(originalIndex / size);
        const col = originalIndex % size;

        const xPercent = col * (100 / (size - 1));
        const yPercent = row * (100 / (size - 1));

        piece.style.backgroundImage = `url('${puzzleState.originalImage}')`;
        piece.style.backgroundSize = `${size * 100}% ${size * 100}%`;
        piece.style.backgroundRepeat = 'no-repeat'; 
        piece.style.backgroundPosition = `${xPercent}% ${yPercent}%`;

        // Só adiciona o clique se a peça NÃO estiver correta
        if (!isCorrect) {
            piece.onclick = () => handlePieceClick(currentIndex);
        }

        grid.appendChild(piece);
    });
}

function handlePieceClick(index) {
    // Segurança: Se a peça já está certa, o clique não faz nada (já tratado no render, mas garante aqui)
    if (puzzleState.pieces[index] === index) return;

    // Se não tem nada selecionado, seleciona este
    if (puzzleState.selectedPieceIndex === null) {
        puzzleState.selectedPieceIndex = index;
        renderPuzzleBoard(); 
        return;
    }

    // Se clicou no mesmo, deseleciona
    if (puzzleState.selectedPieceIndex === index) {
        puzzleState.selectedPieceIndex = null;
        renderPuzzleBoard();
        return;
    }

    // TROCA AS PEÇAS
    const firstIndex = puzzleState.selectedPieceIndex;
    const secondIndex = index;

    const temp = puzzleState.pieces[firstIndex];
    puzzleState.pieces[firstIndex] = puzzleState.pieces[secondIndex];
    puzzleState.pieces[secondIndex] = temp;

    puzzleState.selectedPieceIndex = null;

    // Renderiza o novo estado
    renderPuzzleBoard();

    // 🚨 EFEITO VISUAL DE ACERTO 🚨
    // Verifica se a troca colocou alguém no lugar certo e aplica o flash
    const piecesDom = document.querySelectorAll('.puzzle-piece');
    
    // Checa a primeira peça trocada
    if (puzzleState.pieces[firstIndex] === firstIndex) {
        piecesDom[firstIndex].classList.add('just-solved');
    }
    // Checa a segunda peça trocada
    if (puzzleState.pieces[secondIndex] === secondIndex) {
        piecesDom[secondIndex].classList.add('just-solved');
    }

    // Verifica Vitória
    setTimeout(checkPuzzleWin, 200); // Pequeno delay para não travar a animação
}

async function checkPuzzleWin() {
    let isSolved = true;
    for (let i = 0; i < puzzleState.pieces.length; i++) {
        if (puzzleState.pieces[i] !== i) { isSolved = false; break; }
    }

    if (isSolved) {
        const grid = document.getElementById('puzzle-grid');
        grid.classList.add('solved');

        // --- LÓGICA NOVA ---
        // Pega a config baseada no tamanho atual (3, 4 ou 5)
        const currentSize = puzzleState.gridSize; // 3, 4 ou 5
        const configKey = `puzzle_${currentSize}`;
        
        // Busca no cache ou usa fallback se der erro
        const config = minigameConfig[configKey] || { reward: 50, multi: 1 };
        
        // O prêmio é exatamente o que está no banco * multiplicador (opcional)
        const totalPrize = Math.floor(config.reward * config.multi);
        // -------------------

        await supabase.rpc('atualizar_moedas_jogo', { qtd: totalPrize });
        player.moedas += totalPrize;
        updateHeaderInfo();

        setTimeout(async () => {
            await showGameAlert("ARTE COMPLETA! 🎨", `Imagem montada com sucesso!\nPrêmio: ${totalPrize} moedas.`);
            quitPuzzleGame();
        }, 500);
    }
}
function quitPuzzleGame() {
    document.getElementById('puzzle-arena').classList.add('hidden');
    document.getElementById('games-menu').classList.remove('hidden');
    refreshMinigameEnergy();
}

// =================================================
// MINIGAME: JO-KEN-PO ELEMENTAL
// =================================================

function startJokenpoGame() {
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('jokenpo-arena').classList.remove('hidden');
    
    // Reseta UI
    document.getElementById('jk-game-area').classList.add('hidden'); // Esconde jogo
    document.getElementById('btnStartJokenpo').classList.remove('hidden'); // Mostra botão buscar
    document.getElementById('jk-status').textContent = "Encontre um oponente...";
    
    // Zera placar visual
    document.getElementById('jk-score-player').textContent = '0';
    document.getElementById('jk-score-cpu').textContent = '0';
}

async function initJokenpoMatch() {
    // 1. Verifica Cartas
    const allMyOwned = cardsInAlbum.filter(c => c.owned);
    if (allMyOwned.length < 5) {
        showNotification("Você precisa de 5 cartas!", true);
        return;
    }

    // 2. COBRANÇA DE ENERGIA
    if (!await checkAndSpendEnergy('jokenpo')) return;

    // 3. Prepara Interface
    document.getElementById('btnStartJokenpo').classList.add('hidden');
    document.getElementById('jk-game-area').classList.remove('hidden');
    document.getElementById('jk-status').textContent = "Buscando...";

    // 4. Lógica do Jogo
    jokenpoState.playerScore = 0;
    jokenpoState.cpuScore = 0;
    jokenpoState.round = 1; 
    jokenpoState.isProcessing = false;

// --- CORREÇÃO: CARREGAMENTO FORÇADO DAS REGRAS ---
    // Sempre tenta buscar se estiver vazio
    if (!jokenpoState.rules || jokenpoState.rules.length === 0) {
        console.log("Baixando regras do banco...");
        const { data, error } = await supabase.from('elementos').select('*');
        
        if (error) {
            console.error("Erro ao baixar regras:", error);
            showNotification("Erro de conexão com regras.", true);
            return;
        }
        
        if (data) {
            jokenpoState.rules = data;
            console.log("Regras baixadas com sucesso:", data.length);
        }
    }

    // Embaralha mão do jogador
    jokenpoState.myDeck = [...allMyOwned].sort(() => 0.5 - Math.random()).slice(0, 5);

    // Busca oponente
    const { data: enemyData, error } = await supabase.rpc('buscar_oponente_batalha');
    if (error || !enemyData) {
        showNotification("Erro ao buscar oponente", true);
        quitJokenpoGame();
        return;
    }

    // --- AQUI ESTÁ A MUDANÇA: EMBARALHA O DECK DA CPU ---
    // Garante que a ordem seja aleatória e fixa para a partida
    jokenpoState.cpuDeck = [...enemyData.cartas].sort(() => 0.5 - Math.random());
    // ----------------------------------------------------
    
    const enemyDisplays = document.querySelectorAll('.enemy-name-display');
    enemyDisplays.forEach(el => el.textContent = enemyData.nome.toUpperCase());

    renderJokenpoHand();
    resetJokenpoTable();
    
    document.getElementById('jk-status').textContent = "Escolha seu Elemento!";
}

function renderJokenpoHand() {
    const container = document.getElementById('jk-hand');
    container.innerHTML = '';
    
    jokenpoState.myDeck.forEach(card => {
        const wrapper = document.createElement('div');
        wrapper.className = 'hand-card-wrapper';
        
        // Gera o HTML
        wrapper.innerHTML = createCardHTML(card, false, null, false);

        // --- CORREÇÃO AQUI ---
        // Passamos o 'wrapper' para que o CSS .hand-card-wrapper.played funcione
        wrapper.onclick = () => playJokenpoRound(card, wrapper);
        container.appendChild(wrapper);
    });
}

async function playJokenpoRound(playerCard, cardEl) {
    // Bloqueio de clique duplo
    if (jokenpoState.isProcessing || cardEl.classList.contains('played')) return;
    
    jokenpoState.isProcessing = true;
    
    // Marca carta visualmente
    cardEl.classList.add('played'); 
    cardEl.style.pointerEvents = "none"; 

    // 1. Escolha da CPU
    let cpuCard = jokenpoState.cpuDeck[jokenpoState.round - 1];
    
    if (!cpuCard) {
        const { data: allCards } = await supabase.from('cards').select('*').limit(20);
        cpuCard = allCards[Math.floor(Math.random() * allCards.length)];
    }

    // 2. Renderiza Mesa
    renderCardInSlot(playerCard, 'jk-player-card');
    const enemySlot = document.getElementById('jk-enemy-card');
    enemySlot.innerHTML = '<div class="card-back-pattern"></div>';
    enemySlot.removeAttribute('style');
    enemySlot.className = 'card-preview card-small';

    document.getElementById('jk-player-element').innerHTML = getElementIcon(playerCard.element);
    document.getElementById('jk-player-element').style.background = getElementStyles(playerCard.element).primary;
    document.getElementById('jk-status').textContent = "JO... KEN... PO!";
    document.getElementById('jk-status').style.color = "#FFD700";
    
    await new Promise(r => setTimeout(r, 1000)); // Suspense...

    // 3. Revela CPU
    renderCardInSlot(cpuCard, 'jk-enemy-card');
    document.getElementById('jk-enemy-element').innerHTML = getElementIcon(cpuCard.element);
    document.getElementById('jk-enemy-element').style.background = getElementStyles(cpuCard.element).primary;

    // --- 4. LÓGICA SIMPLIFICADA ---
    let result = 0;
    let reason = "";

    const clean = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
const pEl = clean(playerCard.element);
    const cEl = clean(cpuCard.element);

    // ADICIONE ISTO PARA DEBUGAR:
    console.log('-------------------');
    console.log(`Eu joguei: "${pEl}" (${playerCard.element})`);
    console.log(`CPU jogou: "${cEl}" (${cpuCard.element})`);
    
    // Tenta achar a regra e mostra no console se achou ou não
    const debugRule = jokenpoState.rules.find(r => clean(r.atacante) === pEl && clean(r.defensor) === cEl);
    console.log("Regra encontrada no banco?", debugRule);
    console.log("Total de regras carregadas:", jokenpoState.rules.length);
    console.log('-------------------');

    if (pEl === cEl) {
        result = 0;
        reason = "Elementos Iguais: Empate!";
    } else {
        // Agora buscamos apenas UMA regra: Onde EU sou o atacante
        const rule = jokenpoState.rules.find(r => clean(r.atacante) === pEl && clean(r.defensor) === cEl);

        if (rule) {
            if (rule.resultado === 1) {
                result = 1; 
                reason = `Vantagem! (${playerCard.element} vence ${cpuCard.element})`;
            } else if (rule.resultado === -1) {
                result = -1; 
                reason = `Desvantagem! (${playerCard.element} perde para ${cpuCard.element})`;
            }
        } else {
            // Se não achou regra 1 nem -1, é empate (fallback)
            result = 0;
            reason = "Sem vantagem: Empate.";
        }
    }

    // 5. Placar e Visual
    const statusEl = document.getElementById('jk-status');
    const pElemIcon = document.getElementById('jk-player-element');
    const cElemIcon = document.getElementById('jk-enemy-element');

    if (result === 1) {
        statusEl.textContent = reason;
        statusEl.style.color = "#2ecc71";
        pElemIcon.classList.add('win');
        cElemIcon.classList.add('lose');
        jokenpoState.playerScore++;
    } else if (result === -1) {
        statusEl.textContent = reason;
        statusEl.style.color = "#e74c3c";
        cElemIcon.classList.add('win');
        pElemIcon.classList.add('lose');
        jokenpoState.cpuScore++;
    } else {
        statusEl.textContent = reason;
        statusEl.style.color = "#f1c40f";
    }

    updateJokenpoScore();

    // 6. Próxima
    if (jokenpoState.round < 3) {
        setTimeout(() => { nextJokenpoRound(); }, 2500);
    } else {
        setTimeout(finishJokenpoGame, 2500);
    }
}

function nextJokenpoRound() {
    jokenpoState.round++;
    updateJokenpoScore(); 
    
    resetJokenpoTable(); // Limpa a mesa
    
    // REMOVIDO: document.getElementById('btn-jk-next').classList.add('hidden'); 
    // Não precisamos mais esconder o botão pois ele não existe.

    jokenpoState.isProcessing = false; // Destrava para o jogador clicar de novo
}

function resetJokenpoTable() {
    const statusEl = document.getElementById('jk-status');
    if(statusEl) {
        statusEl.textContent = "Escolha sua carta...";
        statusEl.style.color = "#FFD700";
    }
    
    const pSlot = document.getElementById('jk-player-card');
    const eSlot = document.getElementById('jk-enemy-card');
    
    // LIMPEZA DO JOGADOR
    if(pSlot) {
        pSlot.removeAttribute('style'); // Remove a imagem de fundo da carta anterior
        pSlot.innerHTML = '<div class="slot-placeholder">Sua Carta</div>';
        pSlot.className = 'card-preview card-small empty';
        // Importante: Remover classes de borda de vitória/derrota se tiverem sido aplicadas diretamente aqui (geralmente são aplicadas nos ícones, mas por segurança)
    }

    // LIMPEZA DA CPU
    if(eSlot) {
        eSlot.removeAttribute('style');
        eSlot.innerHTML = '<div class="card-back-pattern"></div>';
        eSlot.className = 'card-preview card-small';
    }

    // LIMPA ÍCONES DE ELEMENTO/RESULTADO
    const pElIcon = document.getElementById('jk-player-element');
    if(pElIcon) {
        pElIcon.className = 'element-indicator';
        pElIcon.innerHTML = '?';
        pElIcon.style.background = '#333';
        pElIcon.classList.remove('win', 'lose'); // Remove brilho verde/vermelho
    }
    
    const eElIcon = document.getElementById('jk-enemy-element');
    if(eElIcon) {
        eElIcon.className = 'element-indicator';
        eElIcon.innerHTML = '?';
        eElIcon.style.background = '#333';
        eElIcon.classList.remove('win', 'lose');
    }
}

function updateJokenpoScore() {
    document.getElementById('jk-score-player').textContent = jokenpoState.playerScore;
    document.getElementById('jk-score-cpu').textContent = jokenpoState.cpuScore;
    
    // Atualiza indicador de Rodada
    const roundCounter = document.getElementById('jk-round-counter');
    if(roundCounter) roundCounter.textContent = `${jokenpoState.round} / 3`;
}

async function finishJokenpoGame() {
    let msg = "";
    let prize = 0;

    if (jokenpoState.playerScore > jokenpoState.cpuScore) {
        msg = "VITÓRIA ELEMENTAL! 🏆";
        const config = minigameConfig['jokenpo'] || { reward: 120 };
        prize = Math.floor(config.reward * config.multi); // <--- IMPORTANTE TER ISSO
        await supabase.rpc('atualizar_moedas_jogo', { qtd: prize });
        player.moedas += prize;
    } else {
        msg = "DERROTA... 💀";
    }

    updateHeaderInfo();
    // 🚨 SUBSTIUIÇÃO AQUI
    await showGameAlert("FIM DO DUELO", `${msg}\nPlacar Final: ${jokenpoState.playerScore} x ${jokenpoState.cpuScore}`);
    quitJokenpoGame();
}

function quitJokenpoGame() {
    document.getElementById('jokenpo-arena').classList.add('hidden');
    document.getElementById('games-menu').classList.remove('hidden');
    refreshMinigameEnergy();
}

// =================================================
// MINIGAME: MASMORRA MISTERIOSA
// =================================================

// Renderiza a mão VISUAL (Exploração)
function renderDungeonHand() {
    const handContainer = document.getElementById('dungeon-hand');
    handContainer.innerHTML = '';
    
    // Ordena para melhor visualização do jogador
    const displayHand = [...dungeonState.playerHand].sort((a, b) => a.power - b.power);

    displayHand.forEach(card => {
        const rarityStyles = getRarityStyles(card.rarity);
        
        // A carta aqui é apenas um visual na mão, não interativa
        const cardHtml = `
            <div class="card-preview card-small" 
                 style="background-image: url('${card.image_url}'); border: 2px solid ${rarityStyles.primary};"
                 title="${card.name}">
                <div class="card-quantity" style="top: 0; right: 0; font-size: 0.8em; padding: 2px 5px;">${card.power} POW</div>
                <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
            </div>
        `;
        handContainer.innerHTML += cardHtml;
    });
}

function startDungeonGame() {
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('dungeon-arena').classList.remove('hidden');
    
    // Mostra Menu, Esconde Jogo
    document.getElementById('dungeon-menu-screen').classList.remove('hidden');
    document.getElementById('dungeon-game-area').classList.add('hidden');
}

async function initDungeonRun() {
    const ownedCards = cardsInAlbum.filter(c => c.owned);
    if (ownedCards.length < 5) {
        await showGameAlert("PERIGO!", "Você precisa de 5 cartas para entrar!");
        return;
    }

    // COBRANÇA DE ENERGIA AQUI
    if (!await checkAndSpendEnergy('dungeon')) return;

    // Sorteia Mão
    dungeonState.playerHand = [...ownedCards].sort(() => 0.5 - Math.random()).slice(0, 5);

    // Troca Tela (Menu -> Jogo)
    document.getElementById('dungeon-menu-screen').classList.add('hidden');
    document.getElementById('dungeon-game-area').classList.remove('hidden');
    document.getElementById('dungeon-combat-overlay').classList.add('hidden');

    // Reset Estado
    dungeonState.lives = 3;
    dungeonState.currentLoot = 0;
    dungeonState.foundTreasures = 0;
    dungeonState.isLocked = false;
    dungeonState.combatMonster = null;
    dungeonState.firstMove = false; // Já pagou na entrada

    updateDungeonUI();
    renderDungeonHand(); 

    // Gera Grid
    let contents = [];
    for(let i=0; i<6; i++) contents.push('treasure');
    for(let i=0; i<5; i++) contents.push('monster');
    for(let i=0; i<2; i++) contents.push('potion');
    for(let i=0; i<2; i++) contents.push('trap');
    for(let i=0; i<1; i++) contents.push('reinforce');
    dungeonState.totalTreasures = 6;
    contents.sort(() => 0.5 - Math.random());

    const grid = document.getElementById('dungeon-grid');
    grid.innerHTML = '';

    contents.forEach((type, index) => {
       const tile = document.createElement('div');
       tile.className = 'dungeon-tile';
       tile.dataset.index = index;
       tile.dataset.type = type;
       
       let contentHTML = '';
       if (type === 'treasure') {
           const config = minigameConfig['dungeon'] || { multi: 1.0 };
           let amount = Math.floor(Math.random() * 41) + 10;
           amount = Math.ceil(amount * config.multi);
           tile.dataset.amount = amount;
           contentHTML = `<div class="tile-back treasure"><i class="fas fa-coins" style="font-size:24px; margin-bottom:5px;"></i>+${amount}</div>`;
       } else if (type === 'potion') {
           contentHTML = `<div class="tile-back potion"><i class="fas fa-heart" style="font-size:24px; margin-bottom:5px;"></i>CURA</div>`;
       } else if (type === 'trap') {
           contentHTML = `<div class="tile-back trap"><i class="fas fa-shoe-prints" style="font-size:24px; margin-bottom:5px;"></i>-1 CARTA</div>`;
       } else if (type === 'reinforce') {
           contentHTML = `<div class="tile-back reinforce"><i class="fas fa-user-plus" style="font-size:24px; margin-bottom:5px;"></i>ALIADO</div>`;
       } else {
           contentHTML = `<div class="tile-back monster"><i class="fas fa-dragon" style="font-size:24px; margin-bottom:5px;"></i>MONSTRO</div>`;
       }
       
       tile.innerHTML = `<div class="tile-front"></div>${contentHTML}`;
       tile.onclick = () => handleDungeonClick(tile);
       grid.appendChild(tile);
    });
}

function renderDungeonHand() {
    const handContainer = document.getElementById('dungeon-hand');
    if (!handContainer) return;
    
    handContainer.innerHTML = '';

    // Ordena visualmente por força para facilitar a estratégia
    const displayHand = [...dungeonState.playerHand].sort((a, b) => a.power - b.power);

    displayHand.forEach(card => {
        const wrapper = document.createElement('div');
        wrapper.className = 'hand-card-wrapper'; // Classe mágica do CSS mobile
        
        // Gera o HTML igual ao do Duelo
        wrapper.innerHTML = createCardHTML(card, false, null, false);
        
        // Lógica de Clique:
        wrapper.onclick = () => {
            if (dungeonState.isLocked && dungeonState.combatMonster) {
                // Se estiver em combate, usa a carta
                resolveDungeonFight(card);
            } else {
                // Se estiver explorando, apenas avisa
                showNotification("Você só pode usar cartas em combate!", true);
            }
        };
        
        handContainer.appendChild(wrapper);
    });
}

async function handleDungeonClick(tile) {
    if (tile.classList.contains('revealed') || dungeonState.isLocked) return;

    tile.classList.add('revealed');
    const type = tile.dataset.type;

    // --- 1. TESOURO ---
if (type === 'treasure') {
        const amount = parseInt(tile.dataset.amount);
        dungeonState.currentLoot += amount;
        dungeonState.foundTreasures++; 
        updateDungeonUI();

        if (dungeonState.foundTreasures >= dungeonState.totalTreasures) {
            setTimeout(async () => {
                await showGameAlert("MAPA LIMPO! 🗺️", "Você encontrou todos os tesouros!");
                forceDungeonExit();
            }, 500);
        }
    }
    // --- 2. POÇÃO (Vida) ---
    else if (type === 'potion') {
        if (dungeonState.lives < 3) {
            dungeonState.lives++;
            showNotification("Vida recuperada! ❤️");
        } else {
            showNotification("Vida cheia! Poção desperdiçada.");
        }
        updateDungeonUI();
    }
    // --- 3. ARMADILHA (Perde Carta) ---
else if (type === 'trap') {
        if (dungeonState.playerHand.length > 0) {
            const randomIndex = Math.floor(Math.random() * dungeonState.playerHand.length);
            const removedCard = dungeonState.playerHand.splice(randomIndex, 1)[0];
            
            // --- CHAMADA PARA ATUALIZAR O VISUAL DA MÃO ---
            renderDungeonHand(); 
            
            showNotification(`ARMADILHA! Perdeu: ${removedCard.name}`, true);
        } else {
            showNotification("Armadilha vazia (sem cartas).");
        }
    }
    // --- 4. REFORÇO (Ganha Carta) ---
else if (type === 'reinforce') {
        const ownedCards = cardsInAlbum.filter(c => c.owned);
        const newCard = ownedCards[Math.floor(Math.random() * ownedCards.length)];
        dungeonState.playerHand.push(newCard);
        showNotification(`REFORÇO! ${newCard.name} entrou!`);
        renderDungeonHandVisual(); // Atualiza a lateral
    }
    // --- 5. MONSTRO ---
    else {
        dungeonState.isLocked = true;
        
        // (Lógica de dificuldade adaptativa - Mantida igual)
        const myDeck = cardsInAlbum.filter(c => c.owned);
        let avgPower = 10; 
        if (myDeck.length > 0) {
            const totalPower = myDeck.reduce((sum, card) => sum + card.power, 0);
            avgPower = totalPower / myDeck.length;
        }

        const minMonsterPower = Math.floor(avgPower * 0.7);
        const maxMonsterPower = Math.ceil(avgPower * 1.4);

        let validMonsters = allGameCards.filter(c => 
            c.power >= minMonsterPower && 
            c.power <= maxMonsterPower
        );
        if (validMonsters.length === 0) validMonsters = allGameCards;

        const randomMonster = validMonsters[Math.floor(Math.random() * validMonsters.length)];
        
        setTimeout(() => startDungeonCombat(randomMonster), 600);
    }
}

async function forceDungeonExit() {
    // Salva o loot
    await supabase.rpc('atualizar_moedas_jogo', { qtd: dungeonState.currentLoot });
    player.moedas += dungeonState.currentLoot;
    updateHeaderInfo();
    
    showNotification(`Masmorra Concluída 100%! +${dungeonState.currentLoot} moedas.`);
    quitDungeonGame();
}


async function startDungeonCombat(monsterCard) {
if (dungeonState.playerHand.length === 0) {
        await showGameAlert("SEM DEFESA! 😱", "O monstro te atacou e você não tem mais cartas para se defender.");
        dungeonState.lives = 0; 
        updateDungeonUI();
        gameOverDungeon();
        return;
    }

dungeonState.combatMonster = monsterCard;
    
    const overlay = document.getElementById('dungeon-combat-overlay');
    overlay.classList.remove('hidden');

    renderCardInSlot(monsterCard, 'dungeon-monster-card');
    
    const powerDisplay = document.getElementById('monster-power-display');
    powerDisplay.textContent = monsterCard.power;

    // Limpa slot do jogador
    const pSlot = document.getElementById('dungeon-player-slot');
    pSlot.innerHTML = '<div class="slot-placeholder">Sua vez...</div>';
    pSlot.removeAttribute('style');
    pSlot.className = 'card-slot empty';

    // --- AQUI: RENDERIZA A MÃO INTERATIVA ---
    const handContainer = document.getElementById('dungeon-hand-combat');
    handContainer.innerHTML = '';

    // Ordena visualmente
    const displayHand = [...dungeonState.playerHand].sort((a, b) => a.power - b.power);

    displayHand.forEach(card => {
        const wrapper = document.createElement('div');
        wrapper.className = 'hand-card-wrapper';
        
        // Gera carta com visual completo
        wrapper.innerHTML = createCardHTML(card, false, null, false);
        
        // Adiciona clique para atacar
        wrapper.onclick = () => resolveDungeonFight(card);
        
        handContainer.appendChild(wrapper);
    });
}

async function resolveDungeonFight(playerCard) {
    // Remove carta usada
    const cardIndex = dungeonState.playerHand.findIndex(c => c.id === playerCard.id);
    if (cardIndex > -1) {
        dungeonState.playerHand.splice(cardIndex, 1);
    }

renderDungeonHandVisual(); // Atualiza a mão lá de trás
    
    // Mostra carta na mesa de combate
    renderCardInSlot(playerCard, 'dungeon-player-slot');

    const monsterPower = dungeonState.combatMonster.power;
    const playerPower = playerCard.power;

    await new Promise(r => setTimeout(r, 800)); 

    const overlay = document.getElementById('dungeon-combat-overlay');

    if (playerPower > monsterPower) {
        await showGameAlert("VITÓRIA! ⚔️", "Monstro derrotado!");
        overlay.classList.add('hidden');
        dungeonState.isLocked = false;
    } else {
        dungeonState.lives--;
        updateDungeonUI();
        await showGameAlert("DERROTA! 🩸", "O monstro era mais forte. Perdeu 1 vida.");
        overlay.classList.add('hidden');
        
        if (dungeonState.lives <= 0) gameOverDungeon();
        else dungeonState.isLocked = false;
    }
}

async function escapeDungeon() {
    if (dungeonState.currentLoot === 0) {
        await showGameAlert("MOCHILA VAZIA", "Você não pegou nada ainda! Explore mais.");
        return;
    }

    // 🚨 SUBSTIUIÇÃO DO CONFIRM POR UM MODAL BONITO
    const querSair = await showGameAlert(
        "FUGIR?", 
        `Você tem ${dungeonState.currentLoot} moedas na mochila.\nDeseja sair e garantir o prêmio?`, 
        true // Habilita botão Cancelar
    );

    if (querSair) {
        await supabase.rpc('atualizar_moedas_jogo', { qtd: dungeonState.currentLoot });
        player.moedas += dungeonState.currentLoot;
        updateHeaderInfo();
        quitDungeonGame();
    }
}

async function gameOverDungeon() {
    // 🚨 SUBSTIUIÇÃO AQUI
    await showGameAlert("VOCÊ DESMAIOU! 💀", "Os monstros roubaram toda sua mochila.\nVocê ganhou 0 moedas.");
    quitDungeonGame();
}

function updateDungeonUI() {
    // Atualiza corações
    let hearts = "";
    for(let i=0; i<dungeonState.lives; i++) hearts += "❤️";
    for(let i=dungeonState.lives; i<3; i++) hearts += "💀"; // Mostra caveira nas vidas perdidas
    
    document.getElementById('dungeon-lives').textContent = hearts;
    document.getElementById('dungeon-loot').textContent = dungeonState.currentLoot;
}

function quitDungeonGame() {
    document.getElementById('dungeon-arena').classList.add('hidden');
    document.getElementById('games-menu').classList.remove('hidden');
    refreshMinigameEnergy();
}

async function loadGameConfig() {
    const { data } = await supabase.from('minigame').select('*');
    if(data) {
        data.forEach(game => {
            let key = '';
            
            // Jogos Padrão
            if(game.nome.includes('Duelo') || game.nome.includes('Batalha')) key = 'battle';
            if(game.nome.includes('Alvo')) key = 'target';
            if(game.nome.includes('Jo-Ken-Po')) key = 'jokenpo';
            if(game.nome.includes('Masmorra')) key = 'dungeon';
            if(game.nome.includes('Batalha')) key = 'battle'; 
            if(game.nome === 'Jogo da Memória') key = 'memory'; // Fallback antigo

            // Puzzle Níveis
            if(game.nome.includes('Puzzle') && game.nome.includes('3x3')) key = 'puzzle_3';
            if(game.nome.includes('Puzzle') && game.nome.includes('4x4')) key = 'puzzle_4';
            if(game.nome.includes('Puzzle') && game.nome.includes('5x5')) key = 'puzzle_5';
            
            // MEMÓRIA NÍVEIS (NOVO)
            if(game.nome.includes('Memória') && game.nome.includes('Fácil')) key = 'memory_4';
            if(game.nome.includes('Memória') && game.nome.includes('Médio')) key = 'memory_6';
            if(game.nome.includes('Memória') && game.nome.includes('Difícil')) key = 'memory_8';

            if(key) {
                minigameConfig[key] = {
                    reward: game.moedas_recompensa,
                    multi: game.multiplicador
                };
            }
        });
    }
}

// --- SISTEMA DE ALERTAS (SUBSTITUI O NATIVO) ---
function showGameAlert(title, message, isConfirm = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('game-alert-modal');
        const titleEl = document.getElementById('alert-title');
        const bodyEl = document.getElementById('alert-body');
        const btnOk = document.getElementById('btn-alert-ok');
        const btnCancel = document.getElementById('btn-alert-cancel');

        // Configura Texto
        titleEl.innerHTML = title; // Permite HTML (ícones)
        bodyEl.innerHTML = message.replace(/\n/g, '<br>'); // Quebra de linha

        // Configura Botões
        btnOk.onclick = () => {
            modal.classList.add('hidden');
            resolve(true); // Retorna VERDADEIRO
        };

        if (isConfirm) {
            btnCancel.classList.remove('hidden');
            btnCancel.onclick = () => {
                modal.classList.add('hidden');
                resolve(false); // Retorna FALSO
            };
        } else {
            btnCancel.classList.add('hidden');
        }

        // Mostra
        modal.classList.remove('hidden');
    });
}

// --- ZOOM DE CARTA NO ÁLBUM ---
function viewBigCard(cardId) {
    const card = cardsInAlbum.find(c => c.id === cardId);
    if (!card || !card.owned) return;

    const container = document.getElementById('zoomed-card');
    
    // 1. Gera o HTML da carta
    container.innerHTML = createCardHTML(card, false, null, false);
    
    // 2. Aplica os estilos necessários (cor da borda)
    const innerCard = container.querySelector('.card-preview');
    const rarityStyles = getRarityStyles(card.rarity);
    
    // Remove a classe 'card-small' para usar o tamanho grande
    innerCard.classList.remove('card-small'); 
    
    // Adiciona a borda dinâmica e desativa o clique
    innerCard.style.border = `4px solid ${rarityStyles.primary}`; 
    innerCard.style.cursor = 'default'; 

    document.getElementById('card-zoom-modal').classList.remove('hidden');
}

function closeCardZoom() {
    document.getElementById('card-zoom-modal').classList.add('hidden');
}
