// app.js - VERSÃO COMPLETA (COM PASTAS E EVOLUÇÃO)

// Variáveis Globais
let player = null;
let cardsInAlbum = [];
let allGameCards = []; 
let packsAvailable = [];
let evolutionRules = {}; // Regras de evolução (ex: {Comum: 5})
let currentOriginView = null; // Controla em qual pasta estamos
const BUCKET_NAME = 'cards';
let marketCards = [];
let pendingTradeId = null; // Guarda qual troca o usuário clicou
let minigameStatus = {}; // Vai guardar a energia: { battle: 5, memory: 3... }

let battleState = {
    round: 1,
    playerScore: 0,
    enemyScore: 0,
    myHand: [],
    enemyDeck: [],
    enemyName: "Rival",
    isProcessing: false // <--- NOVO: Trava cliques duplos
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

    // 3. Carrega TODAS as cartas do jogo
    const { data: allCardsData } = await supabase.from('cards').select('*, personagens_base(origem)').order('power', { ascending: true });
    if (allCardsData) allGameCards = allCardsData;

    // 4. Carrega as cartas do Jogador
    const { data: playerCardData } = await supabase
        .from('cartas_do_jogador')
        .select(`quantidade, card_id, is_new`) // <--- MUDANÇA AQUI
        .eq('jogador_id', userId);

    // 5. Cruza os dados
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
    
    // --- 1. CHECAGEM RÁPIDA: Já coletou hoje? ---
    const hojeString = hoje.toISOString().split('T')[0];
    const ultimoLoginString = ultimoLogin.toISOString().split('T')[0]; 
    
    if (hojeString === ultimoLoginString) {
        // Se já coletou, para o processo aqui.
        return;
    }

    // --- 2. CÁLCULO DE DIFERENÇA DE DIAS (Para o STREAK) ---
    // Zera horas e calcula a diferença de forma tolerante ao fuso
    const dataHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const dataUltimo = new Date(ultimoLogin.getFullYear(), ultimoLogin.getMonth(), ultimoLogin.getDate());
    
    const diffTempo = dataHoje.getTime() - dataUltimo.getTime(); // Pega a diferença em milissegundos
    const diffDias = Math.floor(diffTempo / (1000 * 60 * 60 * 24)); 
    
    // --- 3. LÓGICA DO STREAK (INCREMENTO OU RESET) ---
    let novosDiasConsecutivos = player.dias_consecutivos;
    let premio = 100; // Valor base

    if (diffDias === 1) { 
        // Logou ontem. Sequência continua.
        novosDiasConsecutivos++;
    } else if (diffDias > 1 || diffDias <= 0) { 
        // Quebrou a sequência, fuso horário negativo, ou primeiro login. Reseta para 1.
        novosDiasConsecutivos = 1; 
    }

    // Lógica de Progressão (Continua igual)
    const bonusStreak = Math.min(novosDiasConsecutivos, 7) * 50;
    premio += bonusStreak;

    // --- 4. MOSTRA O MODAL E SALVA ---
    const modal = document.getElementById('daily-reward-modal');
    const dailyAmountEl = document.getElementById('daily-amount');
    const dailyStreakEl = document.getElementById('daily-streak');
    const msgEl = document.getElementById('daily-message');

    // Verifica se os elementos existem antes de tentar escrever (Prevenção de TypeError)
    if (!dailyAmountEl || !dailyStreakEl || !modal) {
        console.error("ERRO DOM: Elementos de modal não encontrados. Verifique IDs.");
        return; 
    }

    dailyAmountEl.textContent = `+${premio}`;
    dailyStreakEl.textContent = novosDiasConsecutivos;
    
    // Mensagem motivacional
    if (novosDiasConsecutivos > 1) {
        msgEl.textContent = `Incrível! ${novosDiasConsecutivos} dias seguidos!`;
    } else {
        msgEl.textContent = "Volte amanhã para aumentar seu bônus!";
    }

    modal.classList.remove('hidden');

    // Configura o botão de receber
const btnCollect = document.getElementById('collectDailyBtn');
const newBtn = btnCollect.cloneNode(true);
btnCollect.parentNode.replaceChild(newBtn, btnCollect);

newBtn.addEventListener('click', async () => {
    newBtn.textContent = "Recebido!";
    
    // CORREÇÃO CRÍTICA: Salvar o momento atual (hoje) para garantir que a checagem diária funcione
    // Ao invés de uma meia-noite 'limpa' que pode ter problemas de fuso, salva o instante de agora
    const dataParaSalvar = (new Date()).toISOString(); // Usa o instante exato da coleta

    const novasMoedas = player.moedas + premio;
    
    const { error } = await supabase
        .from('jogadores')
        .update({ 
            moedas: novasMoedas,
            // AQUI: Salva o instante real (toISOString)
            ultimo_login: dataParaSalvar, 
            dias_consecutivos: novosDiasConsecutivos
        })
        .eq('id', player.id);

    if (error) {
        console.error("Erro ao salvar bônus:", error);
        showNotification("Erro ao salvar bônus.", true);
    } else {
        // ATUALIZAÇÃO LOCAL IMEDIATA
        player.moedas = novasMoedas;
        player.dias_consecutivos = novosDiasConsecutivos;
        player.ultimo_login = dataParaSalvar; // Atualiza a variável local para a próxima checagem
        
        updateHeaderInfo();
        showNotification(`Você ganhou ${premio} moedas!`);
        modal.classList.add('hidden');
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
        if(!confirm("Anunciar esta carta? Ela sairá da sua coleção até alguém trocar ou você cancelar.")) return;
        
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
    if(!confirm("Remover anúncio e pegar carta de volta?")) return;
    
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
        if(!confirm("Trocar sua carta selecionada pela carta do mercado?")) return;
        
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

    // 2. Prepara o Jogo (Grátis agora)
    const btnStart = document.getElementById('btnStartBattle');
    const battleStatus = document.getElementById('battle-status');
    
    btnStart.classList.add('hidden');
    document.querySelector('.player-hand-container').classList.remove('hidden');
    
    if (battleStatus) battleStatus.textContent = "Buscando oponente...";
    showNotification("Iniciando busca...");

    // A. Seleciona 5 cartas aleatórias do jogador para ser a "Mão"
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

    // D. Renderiza a Tela (Com verificação de ID para evitar null)
    const enemyNameDisplay = document.getElementById('enemy-name-display');
    
    if (enemyNameDisplay) enemyNameDisplay.textContent = battleState.enemyName.toUpperCase();
    
    updateRoundDisplay(); // Atualiza o placar
    renderPlayerHand(); // Desenha a mão do jogador
    
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
    const WIN_PRIZE = 150; // Prêmio fixo por vencer

    if (battleState.playerScore > battleState.enemyScore) {
        msg = "VITÓRIA! 🏆";
        prize = WIN_PRIZE;
        
        await supabase.rpc('atualizar_moedas_jogo', { qtd: prize });
        player.moedas += prize;
        showNotification(`PARABÉNS! Você ganhou +${prize} moedas!`);
    
    } else if (battleState.playerScore < battleState.enemyScore) {
        msg = "DERROTA";
        // REMOVIDA: Nenhuma penalidade ou perda de moedas.
        showNotification("Você perdeu a batalha. Tente novamente!", true);

    } else {
        msg = "EMPATE";
        // REMOVIDA: Nenhuma devolução, pois a aposta foi removida.
        showNotification("Empate! Ninguém ganhou moedas desta vez.");
    }
    
    updateHeaderInfo();
    alert(`FIM DE JOGO!\n\n${msg}\nPlacar: ${battleState.playerScore} x ${battleState.enemyScore}`);
    
    resetUI();
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
    if(btnRegister) btnRegister.addEventListener('click', handleRegisterClick);
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
        const games = ['battle', 'memory', 'target', 'dungeon', 'puzzle'];
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
    // Verifica localmente primeiro pra não gastar chamada de rede a toa
    if (minigameStatus[gameType] && minigameStatus[gameType].energia <= 0) {
        showNotification("Sem energia! Espere regenerar (1 a cada 10h).", true);
        return;
    }

    // Tenta gastar energia no Banco de Dados
    const { data: sucesso, error } = await supabase.rpc('gastar_energia_minigame', { tipo_jogo: gameType });

    if (!sucesso || error) {
        showNotification("Erro ou sem energia.", true);
        return;
    }

    // Se gastou com sucesso, atualiza local e inicia o jogo
    minigameStatus[gameType].energia--; 
    refreshMinigameEnergy(); // Atualiza visual

    // ROTEADOR DE JOGOS
    switch(gameType) {
        case 'battle':
            startBattleGame();
            break;
        case 'memory':
            alert("Jogo da Memória: Em breve!"); // Aqui entra a função startMemoryGame()
            break;
        case 'target':
            alert("O Alvo: Em breve!"); // Aqui entra a função startTargetGame()
            break;
        case 'dungeon':
            alert("Masmorra: Em breve!"); // Aqui entra a função startDungeonGame()
            break;
        case 'puzzle':
            alert("Quebra-Cabeça: Em breve!"); // Aqui entra a função startPuzzleGame()
            break;
    }
}
