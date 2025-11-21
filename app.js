// app.js - VERSÃO FINAL COM LOGIN INTERFACE

// Variáveis Globais
let player = null;
let cardsInAlbum = [];
let packsAvailable = [];
const BUCKET_NAME = 'cards';

// Elementos da Tela de Login
const loginScreen = document.getElementById('login-screen');
const gameContent = document.getElementById('game-content');
const emailInput = document.getElementById('emailInput');
const passInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');

// ------------------------------------
// 1. Funções de Autenticação (Login/Cadastro)
// ------------------------------------

async function handleLoginClick() {
    const email = emailInput.value;
    const password = passInput.value;
    
    if (!email || !password) {
        loginError.textContent = "Preencha e-mail e senha.";
        return;
    }
    
    loginError.textContent = "Entrando...";
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        loginError.textContent = "Erro: " + error.message;
    } else {
        loginError.textContent = "";
        // O onAuthStateChange vai detectar o login e mudar a tela
    }
}

async function handleRegisterClick() {
    const email = emailInput.value;
    const password = passInput.value;

    if (password.length < 6) {
        loginError.textContent = "A senha precisa de 6 caracteres.";
        return;
    }

    loginError.textContent = "Criando conta...";

    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password
    });

    if (error) {
        loginError.textContent = "Erro: " + error.message;
    } else {
        alert("Conta criada! Você já está logado.");
        // O trigger SQL vai criar o jogador no banco automaticamente
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
}

// Função que controla qual tela aparece (Login ou Jogo)
function updateUIState(session) {
    if (session) {
        // ESTÁ LOGADO: Esconde login, Mostra jogo
        loginScreen.classList.add('hidden');
        gameContent.classList.remove('hidden');
        loadPlayerData(session.user.id);
    } else {
        // NÃO ESTÁ LOGADO: Mostra login, Esconde jogo
        loginScreen.classList.remove('hidden');
        gameContent.classList.add('hidden');
        player = null;
        cardsInAlbum = [];
        
        // Limpa inputs
        if(emailInput) emailInput.value = "";
        if(passInput) passInput.value = "";
    }
}

// ------------------------------------
// 2. Carregamento de Dados
// ------------------------------------

async function loadPlayerData(userId) {
    console.log("Carregando dados para o ID:", userId);

    // 1. Tenta buscar o jogador
    let { data: playerData, error: playerError } = await supabase
        .from('jogadores')
        .select('*')
        .eq('id', userId)
        .single();

    // 2. REDE DE SEGURANÇA: Se não existir, cria MANUALMENTE agora
    if (!playerData) {
        console.log("Jogador não encontrado no banco. Criando manualmente...");
        
        // Pega o e-mail da sessão atual para preencher
        const { data: { session } } = await supabase.auth.getSession();
        const userEmail = session?.user?.email || "usuario@email.com";

        const { error: insertError } = await supabase
            .from('jogadores')
            .insert([{
                id: userId,
                email: userEmail,
                nome: userEmail.split('@')[0],
                nivel: 1,
                moedas: 500,
                total_cartas: 0
            }]);

        if (insertError) {
            console.error("Erro fatal ao criar jogador:", insertError);
            alert("Erro ao criar seu perfil de jogador. Verifique o console.");
            return;
        }

        console.log("Jogador criado manualmente com sucesso!");
        // Tenta buscar de novo agora que criamos
        return loadPlayerData(userId);
    }
    
    // 3. Sucesso! Carrega os dados na tela
    player = playerData;
    updateHeaderInfo();

    // 4. Carrega as Cartas
    const { data: playerCardData, error: cardError } = await supabase
        .from('cartas_do_jogador')
        .select(`quantidade, card_id, cards (*)`)
        .eq('jogador_id', userId);

    if (!cardError && playerCardData) {
        cardsInAlbum = playerCardData.map(item => {
             if(!item.cards) return null;
             return { ...item.cards, quantidade: item.quantidade };
        }).filter(i => i !== null);
    } else {
        cardsInAlbum = [];
    }

    // 5. Finaliza
    if (packsAvailable.length === 0) await loadPacks();
    renderAlbum();
    
    // Remove a tela de login se ela ainda estiver lá
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-content').classList.remove('hidden');
}

async function loadPacks() {
    const { data } = await supabase.from('pacotes').select('*').order("preco_moedas");
    if (data) {
        packsAvailable = data;
        renderShop(); // Se a loja estiver aberta
    }
}

function updateHeaderInfo() {
    if (!player) return;
    const nameEl = document.getElementById('player-name');
    const coinsEl = document.getElementById('player-coins');
    
    if(nameEl) nameEl.textContent = player.nome;
    if(coinsEl) coinsEl.innerHTML = `<i class="fas fa-coins"></i> ${player.moedas}`;
}

// ------------------------------------
// 3. Lógica do Jogo (Mantida do seu código anterior)
// ------------------------------------

function getElementIcon(element) {
   // ... (Mantenha sua função igual)
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

function getRarityColors(rarity) {
   // ... (Mantenha sua função igual)
   let primaryColor;
   switch (rarity.toLowerCase()) {
       case "mítica": primaryColor = "#FFD700"; break;
       case "lendária": primaryColor = "#FF8C00"; break;
       case "épica": primaryColor = "#9932CC"; break;
       case "rara": primaryColor = "#1E90FF"; break;
       default: primaryColor = "#A9A9A9"; break;
   }
   return { primary: primaryColor };
}

function getElementStyles(element) {
   // ... (Mantenha sua função igual)
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

function showNotification(message, isError = false) {
    const notifArea = document.getElementById('notification-area');
    if(!notifArea) return;
    notifArea.textContent = message;
    notifArea.className = `notification-area ${isError ? 'error' : 'success'}`;
    notifArea.style.display = 'block';
    setTimeout(() => { notifArea.style.display = 'none'; }, 3000);
}

// --- Renderização ---
function renderAlbum() {
    const container = document.getElementById('album-cards-container');
    if (!container) return;
    
    if (!player) return; // Não renderiza se não estiver logado
    
    if (cardsInAlbum.length === 0) {
        container.innerHTML = `<p style="color: white; text-align: center; width: 100%;">Seu álbum está vazio! Compre seu primeiro pacote na Loja.</p>`;
        return;
    }

    let html = '';
    // Agrupar as cartas por Personagem Base (id_base)
    const groupedCards = cardsInAlbum.reduce((acc, card) => {
        const baseId = card.id_base;
        if (!acc[baseId]) {
            acc[baseId] = {
                name: card.name,
                origin: card.personagens_base ? card.personagens_base.origem : 'Desconhecido',
                element: card.element,
                cards: []
            };
        }
        acc[baseId].cards.push(card);
        return acc;
    }, {});
    
    const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];

    for (const baseId in groupedCards) {
        const base = groupedCards[baseId];
        base.cards.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));
        const baseElementStyles = getElementStyles(base.element);
        
        html += `<div class="album-group">
            <h3 style="color: ${baseElementStyles.primary}; border-left-color: ${baseElementStyles.primary};">${base.name} (${base.origin})</h3>
            <div class="card-evolution-line">`;
            
        base.cards.forEach(card => {
            const rarityStyles = getRarityColors(card.rarity);
            html += `
                <div class="card-preview card-small card-collected" style="background-image: url('${card.image_url}'); border: 2px solid ${rarityStyles.primary};" title="${card.name} (${card.rarity})">
                    <span class="card-quantity">x${card.quantidade}</span>
                    <div class="card-content-wrapper">
                        <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">${card.rarity}</div>
                        <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${card.power}</div>
                    </div>
                </div>
            `;
        });
        
        html += `</div></div>`;
    }

    container.innerHTML = html;
}

function renderShop() {
    const container = document.getElementById('packs-list-container');
    if (!container || !player) return;

    let html = '';
    packsAvailable.forEach(pack => {
        html += `
            <div class="pack-item">
                <h4>${pack.nome}</h4>
                <p>Contém <strong>${pack.cartas_total} cartas</strong>.</p>
                <p style="font-size: 0.8em; color: #666;">
                    Comum: ${(pack.chance_comum * 100).toFixed(0)}% | Rara: ${(pack.chance_rara * 100).toFixed(0)}% | 
                    Lendária: ${(pack.chance_lendaria * 100).toFixed(0)}%
                </p>
                <button class="buy-pack-btn" data-id="${pack.id}" data-price="${pack.preco_moedas}">
                    Comprar por <i class="fas fa-coins"></i> ${pack.preco_moedas}
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    document.querySelectorAll('.buy-pack-btn').forEach(button => {
        button.addEventListener('click', handleBuyPack);
    });
}

async function handleBuyPack(event) {
    if (!player) return;
    const packId = event.currentTarget.dataset.id;
    const packPrice = parseInt(event.currentTarget.dataset.price);

    if (player.moedas < packPrice) {
        showNotification("Moedas insuficientes!", true);
        return;
    }
    
    if (!confirm(`Comprar este pacote por ${packPrice} moedas?`)) return;

    // 1. Deduzir Moedas
    const newCoins = player.moedas - packPrice;
    const { error: coinsError } = await supabase
        .from('jogadores')
        .update({ moedas: newCoins })
        .eq('id', player.id);

    if (coinsError) {
        showNotification("Erro ao processar compra.", true);
        return;
    }
    
    player.moedas = newCoins;
    updateHeaderInfo();

    // 2. Gerar Cartas
    const newCards = await generateCardsForPack(packsAvailable.find(p => p.id == packId));
    
    // 3. Salvar Cartas
    await updatePlayerCards(newCards);
    
    showNotification(`Compra realizada! ${newCards.length} novas cartas.`);
    renderAlbum();
}

async function generateCardsForPack(pack) {
    // (Mantive sua lógica de sorteio aqui - simplificada para o exemplo)
    const { data: allCards } = await supabase.from('cards').select('*');
    if(!allCards) return [];

    const cardsByRarity = allCards.reduce((acc, card) => {
        (acc[card.rarity] = acc[card.rarity] || []).push(card);
        return acc;
    }, {});

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
        if (selectedRarity && cardsByRarity[selectedRarity]) {
             const list = cardsByRarity[selectedRarity];
             if(list.length > 0) obtainedCards.push(list[Math.floor(Math.random() * list.length)]);
        }
    }
    return obtainedCards;
}

async function updatePlayerCards(newCards) {
    // (Mantive sua lógica de update/insert)
    if (!player || newCards.length === 0) return;
    
    const updates = newCards.reduce((acc, card) => {
        acc[card.id] = (acc[card.id] || 0) + 1;
        return acc;
    }, {});
    
    for (const cardId in updates) {
        const quantityGained = updates[cardId];
        const existingCard = cardsInAlbum.find(c => c.id === cardId);
        
        if (existingCard) {
            await supabase.from('cartas_do_jogador')
                .update({ quantidade: existingCard.quantidade + quantityGained })
                .eq('jogador_id', player.id).eq('card_id', cardId);
        } else {
            await supabase.from('cartas_do_jogador')
                .insert([{ card_id: cardId, jogador_id: player.id, quantidade: quantityGained }]);
        }
    }
    
    // Recarrega para garantir sincronia
    await loadPlayerData(player.id);
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
            if(sectionId === 'album') renderAlbum();
        });
    });
}

// ------------------------------------
// 4. Inicialização (Events Listeners)
// ------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    // Botões de Login
    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    const btnLogout = document.getElementById('logoutBtn');

    if(btnLogin) btnLogin.addEventListener('click', handleLoginClick);
    if(btnRegister) btnRegister.addEventListener('click', handleRegisterClick);
    if(btnLogout) btnLogout.addEventListener('click', handleLogout);

    setupNavigation();

    // Escuta mudanças de autenticação
    supabase.auth.onAuthStateChange((event, session) => {
        console.log("Auth mudou:", event);
        updateUIState(session);
    });
});
