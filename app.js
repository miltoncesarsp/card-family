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
    
    // Alvo: O ID 'player-name' que você tem no HTML
    const nameEl = document.getElementById('player-name'); 
    const coinsEl = document.getElementById('player-coins');

    if (nameEl && coinsEl) {
        // CORREÇÃO: Usa o nome, com fallback para o e-mail (caso o nome esteja vazio)
        nameEl.textContent = player.nome || player.email; 
        
        coinsEl.innerHTML = `<i class="fas fa-coins"></i> ${player.moedas}`;
        
        // Se precisar do nível, adicione aqui (você não tem o elemento no HTML)
    }
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
                         style="background-image: url('${card.image_url}'); border: 3px solid ${rarityStyles.primary};" 
                         title="${card.name}">
                        
                        ${newBadgeHTML} ${evolutionBtnHTML}
                        
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
function createCardHTML(card, isMine, tradeId = null) {
    const rarityStyles = getRarityColors(card.rarity);
    const elementStyles = getElementStyles(card.element);
    
    let btnCancel = '';
    if (isMine && tradeId) {
        btnCancel = `<button class="cancel-trade-btn" onclick="cancelTrade('${tradeId}')">Cancelar</button>`;
    }

    // --- NOVO: Lógica para mostrar quantidade ---
    // Só mostra a bolinha se a propriedade 'quantidade' existir e for maior que 0
    let quantityHTML = '';
    if (card.quantidade) {
        quantityHTML = `<div class="card-quantity">x${card.quantidade}</div>`;
    }
    // -------------------------------------------

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
    resetUI();
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
        playerSlot.innerHTML = '';
        playerSlot.className = 'card-slot empty';
    }
    if(enemySlot) {
        enemySlot.innerHTML = '<div class="card-back-pattern"></div>';
    }
    
    // Reseta placar
    const scoreP = document.getElementById('score-player');
    const scoreE = document.getElementById('score-enemy');
    const roundEl = document.getElementById('current-round');
    const enemyName = document.getElementById('enemy-name-display');

    if(scoreP) scoreP.textContent = '0';
    if(scoreE) scoreE.textContent = '0';
    if(roundEl) roundEl.textContent = '- / -';
    if(enemyName) enemyName.textContent = 'RIVAL';

    // --- AQUI ERA ONDE DAVA O ERRO ---
    // Agora usamos verificação (if) antes de tentar limpar
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
    // --------------------------------

    document.getElementById('btnStartBattle').classList.remove('hidden');
    const handCont = document.querySelector('.player-hand-container');
    if(handCont) handCont.classList.add('hidden');
}

async function initBattleMatch() {
    // 1. Verifica se tem cartas suficientes (5)
    const myPlayableCards = cardsInAlbum.filter(c => c.owned);
    if (myPlayableCards.length < 5) {
        showNotification("Você precisa de pelo menos 5 cartas para jogar!", true);
        return;
    }

    // 🚨 CORREÇÃO PRINCIPAL: Destrava o clique para a nova partida
    battleState.isProcessing = false; 

    // 2. Prepara o Jogo
    const btnStart = document.getElementById('btnStartBattle');
    const battleStatus = document.getElementById('battle-status');
    
    btnStart.classList.add('hidden');
    document.querySelector('.player-hand-container').classList.remove('hidden');
    
    if (battleStatus) {
        battleStatus.textContent = "Buscando oponente...";
        battleStatus.style.color = "#FFD700"; // Reseta a cor para amarelo
    }
    showNotification("Iniciando busca...");

    // A. Seleciona 5 cartas aleatórias do jogador
    const shuffled = [...myPlayableCards].sort(() => 0.5 - Math.random());
    battleState.myHand = shuffled.slice(0, 5);

    // B. Busca oponente no servidor
    const { data: enemyData, error: enemyError } = await supabase.rpc('buscar_oponente_batalha');
    
    if (enemyError) {
        if (battleStatus) battleStatus.textContent = "ERRO: Nenhum rival encontrado.";
        showNotification("Erro ao achar oponente.", true);
        resetUI();
        return;
    }

    // C. Configura Estado Inicial
    battleState.enemyName = enemyData.nome;
    battleState.enemyDeck = enemyData.cartas;
    battleState.round = 1;
    battleState.playerScore = 0;
    battleState.enemyScore = 0;

    // D. Renderiza a Tela
    const enemyNameDisplay = document.getElementById('enemy-name-display');
    
    if (enemyNameDisplay) enemyNameDisplay.textContent = battleState.enemyName.toUpperCase();
    
    updateRoundDisplay(); 
    renderPlayerHand(); 
    
    if (battleStatus) battleStatus.textContent = "Escolha sua primeira carta!";
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
        const div = document.createElement('div');
        div.className = 'hand-card';
        div.style.backgroundImage = `url('${card.image_url}')`;
        div.dataset.index = index;
        
        // Badge de força na mão pra ajudar a escolher
        div.innerHTML = `<div style="position:absolute; bottom:5px; right:5px; background:white; border-radius:50%; width:20px; height:20px; text-align:center; font-size:10px; line-height:20px; font-weight:bold; color:black;">${card.power}</div>`;

        div.onclick = () => playRound(card, div);
        handContainer.appendChild(div);
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
    const WIN_PRIZE = 150;

    if (battleState.playerScore > battleState.enemyScore) {
        msg = "VITÓRIA! 🏆";
        prize = WIN_PRIZE;
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

// Helper para desenhar carta na arena
function renderCardInSlot(card, slotId) {
    const slot = document.getElementById(slotId);
    const rarityStyles = getRarityColors(card.rarity);
    
    slot.className = 'card-preview card-small';
    slot.style.backgroundImage = `url('${card.image_url}')`;
    slot.style.border = `3px solid ${rarityStyles.primary}`;
    
    slot.innerHTML = `
        <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white;">${card.power}</div>
        <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
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
    // Lista aqui apenas os jogos que já funcionam
const jogosProntos = ['battle', 'memory', 'target', 'puzzle', 'jokenpo', 'dungeon'];

if (!jogosProntos.includes(gameType)) {
        await showGameAlert("EM BREVE 🚧", "Este jogo ainda está em construção.\nGuarde sua energia!");
        return; 
    }

    // --- 2. VERIFICAÇÃO DE ENERGIA ---
    // Verifica localmente primeiro
    if (minigameStatus[gameType] && minigameStatus[gameType].energia <= 0) {
        showNotification("Sem energia! Espere regenerar (1 a cada 10h).", true);
        return;
    }

    // --- 3. COBRANÇA NO BANCO DE DADOS ---
    // Só chega aqui se o jogo estiver na lista de 'jogosProntos'
    const { data: sucesso, error } = await supabase.rpc('gastar_energia_minigame', { tipo_jogo: gameType });

    if (!sucesso || error) {
        showNotification("Erro ou sem energia.", true);
        return;
    }

    // --- 4. SUCESSO: ATUALIZA E INICIA ---
    minigameStatus[gameType].energia--; 
    refreshMinigameEnergy(); // Atualiza visual

    // ROTEADOR DE JOGOS (Switch Case)
    switch (gameType) {
        case 'battle':
            startBattleGame();
            break;
        case 'memory':
            startMemoryGame();
            break;
        case 'target':
            startTargetGame();
            break;
        // Deixe os outros comentados ou sem ação até criar as funções
        case 'dungeon':
             startDungeonGame();
            break;
        case 'puzzle':
             startPuzzleGame();
            break;
        case 'jokenpo':
             startJokenpoGame();
            break;
    }
}

// =================================================
// MINIGAME: MEMÓRIA
// =================================================

async function startMemoryGame() {
    let pool = cardsInAlbum.filter(c => c.owned);

    // 🚨 SUBSTIUIÇÃO AQUI
    if (pool.length < 6) {
        await showGameAlert("FALTAM CARTAS", "Você precisa de pelo menos 6 cartas na coleção para jogar Memória!");
        
        minigameStatus['memory'].energia++;
        refreshMinigameEnergy();
        return;
    }

    // 3. Prepara a Tela
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('memory-arena').classList.remove('hidden');
    document.getElementById('memory-score').textContent = '0';
    
    const grid = document.getElementById('memory-grid');
    grid.innerHTML = 'Carregando...';

    // 4. Reseta Estado
    memoryState = {
        cards: [],
        hasFlippedCard: false,
        lockBoard: false,
        firstCard: null,
        secondCard: null,
        matchesFound: 0
    };

    // 5. Embaralha a coleção do jogador e pega 6 cartas
    pool.sort(() => 0.5 - Math.random());
    const selected = pool.slice(0, 6);

    // 6. Duplica para criar os pares (6 x 2 = 12 cartas)
    let gameCards = [...selected, ...selected].map((card, index) => ({
        ...card,
        tempId: index
    }));

    // Embaralha as 12 cartas da mesa
    gameCards.sort(() => 0.5 - Math.random());

    // 7. Renderiza na Tela
    grid.innerHTML = '';
    gameCards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.classList.add('memory-card');
        cardEl.dataset.cardId = card.id; 
        
        // Usa a imagem e cor da carta do jogador
        cardEl.innerHTML = `
            <div class="memory-front" style="background-image: url('${card.image_url}'); border-color: ${getRarityColors(card.rarity).primary}"></div>
            <div class="memory-back"></div>
        `;

        cardEl.addEventListener('click', () => flipCard(cardEl));
        grid.appendChild(cardEl);
    });
}

function flipCard(cardElement) {
    // Regras de Bloqueio:
    // 1. Se o tabuleiro tá travado (esperando desvirar)
    // 2. Se clicou na mesma carta 2 vezes
    if (memoryState.lockBoard) return;
    if (cardElement === memoryState.firstCard) return;

    cardElement.classList.add('flipped');

    if (!memoryState.hasFlippedCard) {
        // Primeira carta virada
        memoryState.hasFlippedCard = true;
        memoryState.firstCard = cardElement;
        return;
    }

    // Segunda carta virada
    memoryState.secondCard = cardElement;
    checkForMatch();
}

function checkForMatch() {
    // Compara os IDs das cartas originais
    let isMatch = memoryState.firstCard.dataset.cardId === memoryState.secondCard.dataset.cardId;

    if (isMatch) {
        disableCards();
    } else {
        unflipCards();
    }
}

function disableCards() {
    // Travam viradas para sempre
    // Remove o listener de clique (opcional, pois a lógica já impede)
    memoryState.matchesFound++;
    document.getElementById('memory-score').textContent = memoryState.matchesFound;

    resetBoard();

    // Verifica Vitória (6 pares)
    if (memoryState.matchesFound === 6) {
        setTimeout(finishMemoryGame, 500);
    }
}

function unflipCards() {
    memoryState.lockBoard = true; // Trava para o jogador não clicar em outra doida

    setTimeout(() => {
        memoryState.firstCard.classList.remove('flipped');
        memoryState.secondCard.classList.remove('flipped');
        resetBoard();
    }, 1000); // 1 segundo para a criança memorizar
}

function resetBoard() {
    [memoryState.hasFlippedCard, memoryState.lockBoard] = [false, false];
    [memoryState.firstCard, memoryState.secondCard] = [null, null];
}

async function finishMemoryGame() {
    const config = minigameConfig['memory'] || { reward: 50 }; // Fallback seguro
    const prize = config.reward;
    await supabase.rpc('atualizar_moedas_jogo', { qtd: prize });
    player.moedas += prize;
    updateHeaderInfo();
    
    showNotification(`MEMÓRIA COMPLETA! +${prize} moedas!`);
    
    setTimeout(async () => {
        // 🚨 SUBSTIUIÇÃO AQUI
        await showGameAlert("PARABÉNS! 🧠", `Você encontrou todos os pares!\nGanhou ${prize} moedas.`);
        quitMemoryGame();
    }, 300);
}

function quitMemoryGame() {
    document.getElementById('memory-arena').classList.add('hidden');
    document.getElementById('games-menu').classList.remove('hidden');
    refreshMinigameEnergy(); // Atualiza energia visualmente
}

// =================================================
// MINIGAME: O ALVO (BLACKJACK VISUAL)
// =================================================

async function startTargetGame() { // 🚨 Adicione 'async'
    const myDeck = cardsInAlbum.filter(c => c.owned);
    
    // 🚨 SUBSTIUIÇÃO AQUI
    if (myDeck.length === 0) {
        await showGameAlert("SEM CARTAS", "Você precisa de cartas na coleção para jogar!");
        return;
    }

    // --- LÓGICA INTELIGENTE DE ALVO ---
    // Calcula a força média das cartas do jogador
    const totalPower = myDeck.reduce((sum, card) => sum + card.power, 0);
    const avgPower = Math.ceil(totalPower / myDeck.length);

    // Define o alvo para ser algo entre "3 a 5 cartas médias"
    // Ex: Se a média é 10, o alvo será entre 30 e 50.
    const minTarget = avgPower * 3;
    const maxTarget = avgPower * 5;
    
    targetState.goal = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
    
    // Define o tamanho do tubo visual (Alvo + 30% de folga para dar medo de estourar)
    targetMaxScale = Math.ceil(targetState.goal * 1.3);
    // ----------------------------------

    // UI Setup (Igual ao anterior)
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('target-arena').classList.remove('hidden');
    document.getElementById('btn-hit').classList.remove('hidden');
    document.getElementById('btn-stand').classList.remove('hidden');
    document.getElementById('btn-target-exit').classList.add('hidden');
    
// Limpa a carta da mesa
    const cardSlot = document.getElementById('target-card-display');
    cardSlot.innerHTML = '<div class="card-back-pattern"></div>';
    
    // Remove apenas a imagem de fundo, mas mantém o tamanho (transform)
    cardSlot.style.backgroundImage = ''; 
    cardSlot.className = 'card-slot empty';

    targetState.current = 0;
    targetState.isGameOver = false;

    // Renderiza
    document.getElementById('target-goal').textContent = targetState.goal;
    document.getElementById('target-current').textContent = '0';

    // Posiciona a linha vermelha baseada na nova escala dinâmica
    const linePercent = (targetState.goal / targetMaxScale) * 100;
    document.getElementById('target-line').style.bottom = `${linePercent}%`;

    const liquid = document.getElementById('target-liquid');
    liquid.style.height = '0%';
    liquid.className = 'target-liquid-fill';
}

function targetHit() {
    if (targetState.isGameOver) return;

    const myDeck = cardsInAlbum.filter(c => c.owned);
    // Pega carta da coleção
    const randomCard = myDeck[Math.floor(Math.random() * myDeck.length)];
    
    renderCardInSlot(randomCard, 'target-card-display');

    targetState.current += randomCard.power;
    document.getElementById('target-current').textContent = targetState.current;

    // Atualiza Visual usando a escala dinâmica
    let fillPercent = (targetState.current / targetMaxScale) * 100;
    if (fillPercent > 100) fillPercent = 100; 
    
    const liquid = document.getElementById('target-liquid');
    liquid.style.height = `${fillPercent}%`;

    if (targetState.current >= targetState.goal - (targetState.goal * 0.15)) { // 15% de margem
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
        message = "O tubo estourou. Você foi ganancioso!";
    } else {
        const diff = targetState.goal - targetState.current;
        const errorPercentage = (diff / targetState.goal) * 100;
        const config = minigameConfig['target'] || { reward: 100, multi: 1.5 };
        const base = config.reward;

        if (diff === 0) { 
            prize = base; // Prêmio total
        } else if (errorPercentage <= 5) { 
            prize = Math.floor(base * 0.6); // 60%
        } else if (errorPercentage <= 15) { 
            prize = Math.floor(base * 0.3); // 30%
        } else { 
            prize = Math.floor(base * 0.1); // 10%
        }

        if (prize > 0) {
            await supabase.rpc('atualizar_moedas_jogo', { qtd: prize });
            player.moedas += prize;
            updateHeaderInfo();
        }
    }

    setTimeout(async () => {
        // 🚨 SUBSTIUIÇÃO AQUI
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

function initPuzzle(size) {
    puzzleState.gridSize = size;
    
    // 1. Escolhe carta aleatória da coleção
    const myDeck = cardsInAlbum.filter(c => c.owned);
    const randomCard = myDeck[Math.floor(Math.random() * myDeck.length)];
    puzzleState.originalImage = randomCard.image_url;

    // 2. Setup Visual
    document.getElementById('puzzle-difficulty-menu').classList.add('hidden');
    document.getElementById('puzzle-board-container').classList.remove('hidden');
    document.getElementById('puzzle-target-img').src = puzzleState.originalImage;

    // 3. Cria as peças (Lógica Matemática)
    const totalPieces = size * size;
    puzzleState.pieces = [];

    // Cria array ordenado [0, 1, 2, ..., 35]
    for (let i = 0; i < totalPieces; i++) {
        puzzleState.pieces.push(i);
    }

    // Embaralha (Garante que não comece resolvido)
    // Dica: Se fosse aquele puzzle de deslizar, precisaria verificar solubilidade.
    // Como é troca livre, qualquer embaralhamento é solúvel.
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

async function startJokenpoGame() {
    // 1. Verifica Cartas
    const allMyOwned = cardsInAlbum.filter(c => c.owned);
if (allMyOwned.length < 5) {
        await showGameAlert("FALTAM CARTAS", "Você precisa de pelo menos 5 cartas para jogar Jo-Ken-Po!");
        return;
    }

    // 2. Prepara UI
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('jokenpo-arena').classList.remove('hidden');
    
    document.getElementById('jk-status').textContent = "Buscando Oponente...";
    
    // 🚨 RESETA O ESTADO PARA 3 RODADAS
    jokenpoState.playerScore = 0;
    jokenpoState.cpuScore = 0;
    jokenpoState.round = 1; 
    jokenpoState.isProcessing = false;
    
    // Reseta visual das rodadas
    // Se o elemento jk-round-counter não existir, cria ele dentro do round-indicator
    let roundCounter = document.getElementById('jk-round-counter');
    if(!roundCounter) {
        const container = document.querySelector('#jokenpo-arena .round-indicator');
        // Limpa o conteúdo antigo (o "VS")
        container.innerHTML = '<span>RODADA</span>';
        roundCounter = document.createElement('strong');
        roundCounter.id = 'jk-round-counter';
        container.appendChild(roundCounter);
    }
    roundCounter.textContent = "1 / 3";

    updateJokenpoScore();

    // 3. Carrega Regras (Cache)
    if (jokenpoState.rules.length === 0) {
        const { data } = await supabase.from('elementos').select('*');
        if (data) jokenpoState.rules = data;
    }

    // 4. Prepara Mão do Jogador (5 cartas aleatórias)
    jokenpoState.myDeck = [...allMyOwned]
        .sort(() => 0.5 - Math.random())
        .slice(0, 5);

    // 5. Busca Oponente Real
    const { data: enemyData, error } = await supabase.rpc('buscar_oponente_batalha');
    
if (error || !enemyData) {
        await showGameAlert("ERRO", "Não foi possível encontrar um oponente.");
        quitJokenpoGame();
        return;
    }

    // SALVA AS CARTAS DO RIVAL NO ESTADO
    jokenpoState.cpuDeck = enemyData.cartas;

    // Mostra o nome do rival
    const enemyLabel = document.querySelector('#jokenpo-arena .enemy-score small');
    if(enemyLabel) enemyLabel.textContent = enemyData.nome.toUpperCase();

    renderJokenpoHand();
    resetJokenpoTable();
}

function renderJokenpoHand() {
    const container = document.getElementById('jk-hand');
    container.innerHTML = '';
    
    // Mostra as cartas do jogador
    jokenpoState.myDeck.forEach(card => {
        const div = document.createElement('div');
        div.className = 'hand-card';
        div.style.backgroundImage = `url('${card.image_url}')`;
        div.style.flexShrink = '0'; // Garante mobile
        
        // Ícone do elemento pequeno na carta
        div.innerHTML = `
            <div style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.7); border-radius:50%; width:20px; height:20px; display:flex; justify-content:center; align-items:center; font-size:10px; color:white;">
                ${getElementIcon(card.element)}
            </div>
        `;

        div.onclick = () => playJokenpoRound(card, div);
        container.appendChild(div);
    });
}

async function playJokenpoRound(playerCard, cardEl) {
    // Bloqueio de duplo clique
    if (jokenpoState.isProcessing) return;
    jokenpoState.isProcessing = true;

    // 1. Escolha da CPU
    // Pega a carta correspondente à rodada atual (Índice 0, 1 ou 2)
    // jokenpoState.round começa em 1, então subtraímos 1 para pegar o índice do array
    let cpuCard = jokenpoState.cpuDeck[jokenpoState.round - 1];

    // Fallback de segurança: Se por algum motivo o deck vier vazio ou menor
    if (!cpuCard) {
        // Pega uma carta aleatória do sistema só pra não travar
        const { data: allCards } = await supabase.from('cards').select('*').limit(20);
        cpuCard = allCards[Math.floor(Math.random() * allCards.length)];
    }

    // 2. Visual: Coloca cartas na mesa
    renderCardInSlot(playerCard, 'jk-player-card');
    
    const enemySlot = document.getElementById('jk-enemy-card');
    enemySlot.innerHTML = '<div class="card-back-pattern"></div>';
    enemySlot.removeAttribute('style');
    enemySlot.className = 'card-preview card-small';

    // Ícones iniciais
    document.getElementById('jk-player-element').innerHTML = getElementIcon(playerCard.element);
    document.getElementById('jk-player-element').style.background = getElementStyles(playerCard.element).primary;
    
    document.getElementById('jk-status').textContent = "JO... KEN... PO!";
    document.getElementById('jk-status').style.color = "#FFD700";
    
    // Suspense
    await new Promise(r => setTimeout(r, 1000));

    // 3. Revela CPU
    renderCardInSlot(cpuCard, 'jk-enemy-card');
    document.getElementById('jk-enemy-element').innerHTML = getElementIcon(cpuCard.element);
    document.getElementById('jk-enemy-element').style.background = getElementStyles(cpuCard.element).primary;

    // --- 4. LÓGICA DE COMBATE HIERÁRQUICA ---
    let result = 0; // 0=Empate, 1=Player, -1=CPU
    let reason = "";

    // A. Verifica Vantagem de ELEMENTO (Prioridade Máxima)
    const myAdvantage = jokenpoState.rules.find(r => r.atacante === playerCard.element && r.defensor === cpuCard.element);
    const cpuAdvantage = jokenpoState.rules.find(r => r.atacante === cpuCard.element && r.defensor === playerCard.element);

    if (myAdvantage && myAdvantage.resultado === 1) {
        result = 1;
        reason = `Vantagem Elemental! (${playerCard.element} > ${cpuCard.element})`;
    } else if (cpuAdvantage && cpuAdvantage.resultado === 1) {
        result = -1;
        reason = `Desvantagem Elemental! (${cpuCard.element} > ${playerCard.element})`;
    } 
    // B. Se não houve vantagem elemental (Neutro ou Mesmo Elemento), usa a FORÇA
    else {
        if (playerCard.power > cpuCard.power) {
            result = 1;
            reason = "Elementos Neutros: Vitória por Força!";
        } else if (playerCard.power < cpuCard.power) {
            result = -1;
            reason = "Elementos Neutros: Derrota por Força!";
        } else {
            result = 0;
            reason = "Empate Total (Elemento e Força)";
        }
    }

    // 5. Aplica Resultado Visual
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

    // 6. Controle de Rodadas
    if (jokenpoState.round < 3) {
        // Prepara próxima rodada
        document.getElementById('btn-jk-next').classList.remove('hidden');
        // Remove a carta usada da mão (visual)
        cardEl.style.opacity = "0.3";
        cardEl.style.pointerEvents = "none";
    } else {
        // Fim de Jogo
        setTimeout(finishJokenpoGame, 1500);
    }
}

function nextJokenpoRound() {
    jokenpoState.round++;
    updateJokenpoScore(); // Atualiza o texto "Rodada X / 3"
    
    resetJokenpoTable();
    document.getElementById('btn-jk-next').classList.add('hidden');
    jokenpoState.isProcessing = false;
}

function resetJokenpoTable() {
    document.getElementById('jk-status').textContent = "Escolha sua carta...";
    document.getElementById('jk-status').style.color = "#FFD700";
    
    const pSlot = document.getElementById('jk-player-card');
    const eSlot = document.getElementById('jk-enemy-card');
    
    // Limpa cartas
    pSlot.removeAttribute('style');
    pSlot.innerHTML = '<div class="slot-placeholder">Sua Carta</div>';
    pSlot.className = 'card-preview card-small empty';

    eSlot.removeAttribute('style');
    eSlot.innerHTML = '<div class="card-back-pattern"></div>';
    eSlot.className = 'card-preview card-small';

    // Limpa ícones
    document.getElementById('jk-player-element').className = 'element-indicator';
    document.getElementById('jk-player-element').innerHTML = '?';
    document.getElementById('jk-player-element').style.background = '#333';
    
    document.getElementById('jk-enemy-element').className = 'element-indicator';
    document.getElementById('jk-enemy-element').innerHTML = '?';
    document.getElementById('jk-enemy-element').style.background = '#333';
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
        prize = config.reward;
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

async function startDungeonGame() {
    // 1. Verifica e Seleciona as 5 Cartas
    const ownedCards = cardsInAlbum.filter(c => c.owned);
    
if (ownedCards.length < 5) {
        await showGameAlert("PERIGO!", "Você precisa de pelo menos 5 cartas para entrar na masmorra!");
        return;
    }

    dungeonState.playerHand = [...ownedCards]
        .sort(() => 0.5 - Math.random())
        .slice(0, 5);

    // 2. UI Setup
    document.getElementById('games-menu').classList.add('hidden');
    document.getElementById('dungeon-arena').classList.remove('hidden');
    document.getElementById('dungeon-combat-overlay').classList.add('hidden');

    // 3. Reset Estado
    dungeonState.lives = 3;
    dungeonState.currentLoot = 0;
    dungeonState.foundTreasures = 0; // Reset
    dungeonState.isLocked = false;
    updateDungeonUI();

    // 4. Gera o Tabuleiro (4x4 = 16 tiles)
    // NOVA DISTRIBUIÇÃO:
    // 6 Tesouros (Ouro)
    // 5 Monstros (Perigo)
    // 2 Poções (Vida)
    // 2 Armadilhas (Perde Carta) <--- NOVO
    // 1 Reforço (Ganha Carta)   <--- NOVO
    
    let contents = [];
    for(let i=0; i<6; i++) contents.push('treasure');
    for(let i=0; i<5; i++) contents.push('monster');
    for(let i=0; i<2; i++) contents.push('potion');
    for(let i=0; i<2; i++) contents.push('trap');      // Armadilha
    for(let i=0; i<1; i++) contents.push('reinforce'); // Reforço
    
    dungeonState.totalTreasures = 6; // Define o objetivo

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
            amount = Math.ceil(amount * config.multi); // Aplica o multiplicador do Admin
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

        tile.innerHTML = `
            <div class="tile-front"></div>
            ${contentHTML}
        `;

        tile.onclick = () => handleDungeonClick(tile);
        grid.appendChild(tile);
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
        dungeonState.foundTreasures++; // Conta +1 achado
        updateDungeonUI();

        // VERIFICAÇÃO DE VITÓRIA AUTOMÁTICA
        // Se achou todos os tesouros, sai automaticamente
if (dungeonState.foundTreasures >= dungeonState.totalTreasures) {
            setTimeout(async () => {
                // 🚨 SUBSTIUIÇÃO AQUI
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
            // Remove carta aleatória da mão
            const randomIndex = Math.floor(Math.random() * dungeonState.playerHand.length);
            const removedCard = dungeonState.playerHand.splice(randomIndex, 1)[0];
            
            showNotification(`ARMADILHA! Você derrubou: ${removedCard.name}`, true);
            
            // Se ficar sem cartas, morre na hora? Não, deixamos ele tentar fugir ou achar poção.
            // Só morre se encontrar monstro depois.
        } else {
            showNotification("Ufa! Armadilha vazia (você não tinha cartas).");
        }
    }
    // --- 4. REFORÇO (Ganha Carta) ---
    else if (type === 'reinforce') {
        // Pega todas as cartas da coleção
        const ownedCards = cardsInAlbum.filter(c => c.owned);
        // Sorteia uma nova
        const newCard = ownedCards[Math.floor(Math.random() * ownedCards.length)];
        
        dungeonState.playerHand.push(newCard);
        showNotification(`REFORÇO! ${newCard.name} entrou na mão!`);
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


async function startDungeonCombat(monsterCard) { // 🚨 Adicione 'async'
    // VERIFICAÇÃO DE MORTE SÚBITA
    if (dungeonState.playerHand.length === 0) {
        // 🚨 SUBSTIUIÇÃO AQUI
        await showGameAlert("SEM DEFESA! 😱", "O monstro te atacou e você não tem mais cartas para se defender.");
        
        dungeonState.lives = 0; 
        updateDungeonUI();
        gameOverDungeon();
        return;
    }

    dungeonState.combatMonster = monsterCard;
    
    const overlay = document.getElementById('dungeon-combat-overlay');
    overlay.classList.remove('hidden');

    // Mostra Monstro
    renderCardInSlot(monsterCard, 'dungeon-monster-card');
    
    const powerDisplay = document.getElementById('monster-power-display');
    powerDisplay.textContent = monsterCard.power;
    powerDisplay.style.color = "#e74c3c";
    powerDisplay.style.fontSize = "1.5em";

    // Limpa slot do jogador
    const pSlot = document.getElementById('dungeon-player-slot');
    pSlot.innerHTML = '<div class="slot-placeholder">Sua vez...</div>';
    pSlot.removeAttribute('style');
    pSlot.className = 'card-slot empty';

    // RENDERIZA A MÃO FIXA (Ordenada por força)
    const handContainer = document.getElementById('dungeon-hand');
    handContainer.innerHTML = '';

    // Ordena apenas visualmente para ajudar a escolher
    const displayHand = [...dungeonState.playerHand].sort((a, b) => a.power - b.power);

    displayHand.forEach(card => {
        const div = document.createElement('div');
        div.className = 'hand-card';
        div.style.backgroundImage = `url('${card.image_url}')`;
        div.style.flexShrink = '0';
        
        const rarityColor = getRarityColors(card.rarity).primary;
        
        div.innerHTML = `
            <div style="position: absolute; bottom: 5px; right: 5px; background: ${rarityColor}; color: white; border: 2px solid white; border-radius: 50%; width: 25px; height: 25px; display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 12px;">${card.power}</div>
        `;
        
        div.onclick = () => resolveDungeonFight(card);
        handContainer.appendChild(div);
    });
}

async function resolveDungeonFight(playerCard) {
    // 1. REMOVE A CARTA DA MÃO (Consome o recurso)
    // Acha o índice da carta usada no array original
    const cardIndex = dungeonState.playerHand.findIndex(c => c.id === playerCard.id);
    if (cardIndex > -1) {
        dungeonState.playerHand.splice(cardIndex, 1); // Remove 1 elemento
    }

    // Renderiza escolha
    renderCardInSlot(playerCard, 'dungeon-player-slot');

    const monsterPower = dungeonState.combatMonster.power;
    const playerPower = playerCard.power;

    await new Promise(r => setTimeout(r, 800)); 

    const overlay = document.getElementById('dungeon-combat-overlay');

if (playerPower > monsterPower) {
        // 🚨 SUBSTIUIÇÃO AQUI
        await showGameAlert("VITÓRIA! ⚔️", "Você venceu o monstro!\nSua carta foi descartada.");
        overlay.classList.add('hidden');
        dungeonState.isLocked = false;
    } else {
        dungeonState.lives--;
        updateDungeonUI();
        // 🚨 SUBSTIUIÇÃO AQUI
        await showGameAlert("DERROTA! 🩸", "Você perdeu 1 vida.\nSua carta foi descartada.");
        overlay.classList.add('hidden');
        
        if (dungeonState.lives <= 0) {
            gameOverDungeon();
        } else {
            dungeonState.isLocked = false;
        }
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
            
            // Mapeamento exato dos novos nomes
            if(game.nome.includes('Memória')) key = 'memory';
            if(game.nome.includes('Alvo')) key = 'target';
            if(game.nome.includes('Jo-Ken-Po')) key = 'jokenpo';
            if(game.nome.includes('Masmorra')) key = 'dungeon';
            if(game.nome.includes('Batalha')) key = 'battle'; 

            // Lógica especial para os 3 Puzzles
            if(game.nome.includes('Puzzle') && game.nome.includes('3x3')) key = 'puzzle_3';
            if(game.nome.includes('Puzzle') && game.nome.includes('4x4')) key = 'puzzle_4';
            if(game.nome.includes('Puzzle') && game.nome.includes('5x5')) key = 'puzzle_5';
            
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
