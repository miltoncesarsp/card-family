// app.js

// Importa a instância do Supabase do seu arquivo supabaseClient-v2.js
// Certifique-se de que supabaseClient-v2.js exporta a instância Supabase
// Ex: const supabase = createClient(...)
// Você já está carregando o script no HTML, então a variável 'supabase' deve estar disponível globalmente.

let player = null; // Objeto global para armazenar os dados do jogador logado
let cardsInAlbum = []; // Array para as cartas do jogador
let packsAvailable = []; // Array para os pacotes disponíveis

const BUCKET_NAME = 'cards'; // Usado para acessar imagens

// Mapeamento de Cores e Ícones (copie do admin.js para consistência visual)
// ... (Copie getElementIcon, getRarityColors, getElementStyles do seu admin.js para app.js)

// Funções Auxiliares (como no admin.js, se necessário)
function getRarityColors(rarity) {
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
function getElementIcon(element) { /* ... (copie do admin.js) ... */ }
function getElementStyles(element) { /* ... (copie do admin.js) ... */ }


function showNotification(message, isError = false) {
    const notifArea = document.getElementById('notification-area');
    notifArea.textContent = message;
    notifArea.className = `notification-area ${isError ? 'error' : 'success'}`;
    notifArea.style.display = 'block';
    setTimeout(() => { notifArea.style.display = 'none'; }, 3000);
}

// ------------------------------------
// 2. Autenticação e Gestão de Sessão
// ------------------------------------

async function handleAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        // Usuário logado
        await loadPlayerData(user.id);
        updateUIForLoggedIn();
    } else {
        // Usuário deslogado
        updateUIForLoggedOut();
    }
}

async function loginOrSignup() {
    // Exemplo Simples: Usar o método Magic Link ou Social Login
    // Você pode usar o método que melhor se encaixa no seu projeto
    const email = prompt("Digite seu e-mail para Entrar ou Cadastrar:");
    if (!email) return;

    // Supabase envia um Magic Link para o e-mail
    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
        showNotification(`Erro de autenticação: ${error.message}`, true);
    } else {
        showNotification("Link de acesso enviado para seu e-mail. Verifique a caixa de entrada!");
    }
}

async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        showNotification(`Erro ao sair: ${error.message}`, true);
    } else {
        player = null;
        cardsInAlbum = [];
        updateUIForLoggedOut();
        // Recarrega o álbum para mostrar o estado inicial/vazio
        renderAlbum(); 
    }
}

function updateUIForLoggedIn() {
    document.getElementById('authButtons').innerHTML = `
        <button id="logoutBtn">Sair</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('player-name').textContent = player.nome || player.email.split('@')[0];
    document.getElementById('player-coins').innerHTML = `<i class="fas fa-coins"></i> ${player.moedas}`;
    document.getElementById('player-level').innerHTML = `<i class="fas fa-star"></i> Nível ${player.nivel}`;
    // Ativa funcionalidades do jogo
    document.querySelectorAll('.nav-btn').forEach(btn => btn.disabled = false); 
}

function updateUIForLoggedOut() {
    document.getElementById('authButtons').innerHTML = `
        <button id="loginBtn">Entrar / Cadastrar</button>
    `;
    document.getElementById('loginBtn').addEventListener('click', loginOrSignup);
    document.getElementById('player-name').textContent = 'Visitante';
    document.getElementById('player-coins').innerHTML = `<i class="fas fa-coins"></i> 0`;
    document.getElementById('player-level').innerHTML = `<i class="fas fa-star"></i> Nível 1`;
    // Desativa funcionalidades do jogo para visitantes
    document.querySelectorAll('.nav-btn').forEach(btn => btn.disabled = true); 
}


// ------------------------------------
// 3. Carregamento de Dados
// ------------------------------------

async function loadPlayerData(userId) {
    // 1. Carrega dados do jogador (jogadores)
    let { data: playerData, error: playerError } = await supabase
        .from('jogadores')
        .select('*')
        .eq('id', userId)
        .single();

    if (playerError && playerError.code === 'PGRST116') { // Não encontrado - Insere
        // Este é um novo jogador. Cria um registro inicial.
        const { data: newPlayer, error: insertError } = await supabase
            .from('jogadores')
            .insert([{ id: userId, nome: 'Novo Jogador', email: '...', nivel: 1, moedas: 100 }]) // Moedas iniciais
            .select('*')
            .single();

        if (insertError) {
            console.error("Erro ao criar novo jogador:", insertError);
            showNotification("Erro ao criar novo perfil. Tente novamente.", true);
            return;
        }
        playerData = newPlayer;
    } else if (playerError) {
        console.error("Erro ao carregar jogador:", playerError);
        showNotification("Erro ao carregar seu perfil. Tente recarregar a página.", true);
        return;
    }
    
    player = playerData;

    // 2. Carrega as cartas do jogador (cartas_do_jogador)
    const { data: playerCardData, error: cardError } = await supabase
        .from('cartas_do_jogador')
        .select(`
            quantidade,
            cards ( id, name, rarity, power, image_url, element, id_base, personagens_base (origem) )
        `)
        .eq('jogador_id', userId);

    if (cardError) {
        console.error("Erro ao carregar cartas do jogador:", cardError);
        showNotification("Erro ao carregar suas cartas.", true);
        cardsInAlbum = [];
    } else {
        cardsInAlbum = playerCardData.map(item => ({
            ...item.cards,
            quantidade: item.quantidade
        }));
    }

    // 3. Carrega Pacotes (uma vez)
    if (packsAvailable.length === 0) {
        await loadPacks();
    }
    
    // Atualiza a visualização inicial
    renderAlbum(); 
}

async function loadPacks() {
    const { data, error } = await supabase.from('pacotes').select('*').order("preco_moedas", { ascending: true });
    if (error) {
        console.error("Erro ao carregar pacotes:", error);
    } else {
        packsAvailable = data;
        renderShop();
    }
}

// ------------------------------------
// 4. Renderização (Álbum e Loja)
// ------------------------------------

function renderAlbum() {
    const container = document.getElementById('album-cards-container');
    if (!container) return;
    
    if (!player) {
        container.innerHTML = `<p>Faça login para ver e gerenciar sua coleção!</p>`;
        return;
    }
    
    if (cardsInAlbum.length === 0) {
        container.innerHTML = `<p>Seu álbum está vazio! Compre seu primeiro pacote na Loja.</p>`;
        return;
    }

    let html = '';
    
    // Agrupar as cartas por Personagem Base (id_base)
    const groupedCards = cardsInAlbum.reduce((acc, card) => {
        const baseId = card.id_base;
        if (!acc[baseId]) {
            acc[baseId] = {
                name: card.name,
                origin: card.personagens_base.origem,
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
                        <button class="card-action-btn" data-card-id="${card.id}">Evoluir/Vender</button>
                    </div>
                </div>
            `;
        });
        
        html += `</div></div>`;
    }

    container.innerHTML = html;
    // Adicione listeners para os botões de ação aqui
}

function renderShop() {
    const container = document.getElementById('packs-list-container');
    if (!container) return;

    if (!player) {
        container.innerHTML = `<p>Faça login para acessar a loja.</p>`;
        return;
    }

    let html = '';
    packsAvailable.forEach(pack => {
        html += `
            <div class="pack-item">
                <h4>${pack.nome}</h4>
                <p>Contém **${pack.cartas_total} cartas**.</p>
                <p>Chances de Drop (C/R/E/L/M): 
                    ${(pack.chance_comum * 100).toFixed(0)}% / 
                    ${(pack.chance_rara * 100).toFixed(0)}% / 
                    ${(pack.chance_epica * 100).toFixed(0)}% / 
                    ${(pack.chance_lendaria * 100).toFixed(0)}% / 
                    ${(pack.chance_mitica * 100).toFixed(0)}%
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

// ------------------------------------
// 5. Lógica do Jogo (Compra de Pacotes)
// ------------------------------------

async function handleBuyPack(event) {
    if (!player) {
        showNotification("Você precisa estar logado para comprar pacotes.", true);
        return;
    }
    
    const packId = event.currentTarget.dataset.id;
    const packPrice = parseInt(event.currentTarget.dataset.price);

    if (player.moedas < packPrice) {
        showNotification("Moedas insuficientes!", true);
        return;
    }
    
    const pack = packsAvailable.find(p => p.id == packId);
    if (!pack) {
        showNotification("Pacote não encontrado.", true);
        return;
    }
    
    if (!confirm(`Deseja realmente comprar o Pacote ${pack.nome} por ${packPrice} moedas?`)) return;

    // A. Dedução das Moedas
    const newCoins = player.moedas - packPrice;
    const { error: coinsError } = await supabase
        .from('jogadores')
        .update({ moedas: newCoins })
        .eq('id', player.id);

    if (coinsError) {
        showNotification(`Erro ao debitar moedas: ${coinsError.message}`, true);
        return;
    }
    
    player.moedas = newCoins; // Atualiza a variável local
    updateUIForLoggedIn(); // Atualiza a interface (mostra novas moedas)
    showNotification(`Pacote ${pack.nome} comprado! Abrindo...`);

    // B. Lógica de Geração de Cartas (Simulação - O Ideal é ter uma Function Supabase)
    const newCards = await generateCardsForPack(pack);
    
    if (newCards.length === 0) {
         showNotification("Nenhuma carta gerada. Verifique as configurações do pacote.", true);
         return;
    }

    // C. Atualiza cartas do jogador no banco de dados e localmente
    await updatePlayerCards(newCards);
    
    // D. Mostrar o resultado do pacote (seria uma função de renderização separada)
    showNotification(`Você ganhou ${newCards.length} cartas! Atualizando seu álbum.`);
    renderAlbum(); // Recarrega o álbum

    // Você deve criar um modal ou uma tela para exibir as novas cartas com animação!
    console.log("Cartas obtidas:", newCards.map(c => `${c.name} (${c.rarity})`));
}


async function generateCardsForPack(pack) {
    // 1. Obter todas as cartas disponíveis no banco
    const { data: allCards, error: cardsError } = await supabase
        .from('cards')
        .select('*');

    if (cardsError || !allCards || allCards.length === 0) {
        showNotification("Erro ao carregar cartas para o pacote.", true);
        return [];
    }
    
    // 2. Mapear cartas por raridade para facilitar a seleção
    const cardsByRarity = allCards.reduce((acc, card) => {
        (acc[card.rarity] = acc[card.rarity] || []).push(card);
        return acc;
    }, {});
    
    // 3. Definir as probabilidades (já estão em formato decimal 0.0 a 1.0)
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
        
        // Seleciona a raridade baseada nas chances
        for (const { rarity, chance } of chances) {
            cumulativeChance += chance;
            if (randomValue <= cumulativeChance) {
                selectedRarity = rarity;
                break;
            }
        }
        
        // Se uma raridade foi selecionada e tem cartas disponíveis
        if (selectedRarity) {
            const cards = cardsByRarity[selectedRarity];
            if (cards && cards.length > 0) {
                // Escolhe uma carta aleatória da raridade
                const randomIndex = Math.floor(Math.random() * cards.length);
                const selectedCard = cards[randomIndex];
                
                // Armazena a carta obtida
                obtainedCards.push(selectedCard);
            }
        }
    }
    
    return obtainedCards;
}


async function updatePlayerCards(newCards) {
    if (!player || newCards.length === 0) return;
    
    // Agrupa as novas cartas por ID para atualização em lote
    const updates = newCards.reduce((acc, card) => {
        acc[card.id] = (acc[card.id] || 0) + 1;
        return acc;
    }, {});
    
    const dbUpdates = [];

    for (const cardId in updates) {
        const quantityGained = updates[cardId];
        
        // Verifica se o jogador já tem a carta
        const existingCard = cardsInAlbum.find(c => c.id == cardId);
        
        if (existingCard) {
            // Se já tem, incrementa a quantidade
            existingCard.quantidade += quantityGained;
            dbUpdates.push({
                card_id: cardId,
                jogador_id: player.id,
                quantidade: existingCard.quantidade,
                is_new: false // Não é nova, apenas mais uma cópia
            });
            
            // Usamos o UPDATE com RLS (Row Level Security)
            const { error } = await supabase
                .from('cartas_do_jogador')
                .update({ quantidade: existingCard.quantidade })
                .eq('jogador_id', player.id)
                .eq('card_id', cardId);
            
            if (error) { console.error("Erro ao atualizar quantidade:", error); }

        } else {
            // Se for nova, insere no banco e no array local
            const newCardObject = newCards.find(c => c.id == cardId); // Pega o objeto completo da carta
            cardsInAlbum.push({ ...newCardObject, quantidade: quantityGained });

            const { error } = await supabase
                .from('cartas_do_jogador')
                .insert([{
                    card_id: cardId,
                    jogador_id: player.id,
                    quantidade: quantityGained,
                    is_new: true 
                }]);
                
            if (error) { console.error("Erro ao inserir nova carta:", error); }
        }
    }
    
    // Atualiza o total de cartas do jogador
    const totalCartas = cardsInAlbum.reduce((sum, c) => sum + c.quantidade, 0);
    const { error: totalError } = await supabase
        .from('jogadores')
        .update({ total_cartas: totalCartas })
        .eq('id', player.id);
        
    if (totalError) { console.error("Erro ao atualizar total de cartas do jogador:", totalError); }
    player.total_cartas = totalCartas;
}


// ------------------------------------
// 6. Navegação entre Seções
// ------------------------------------

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const sectionId = e.currentTarget.dataset.section;
            
            // Remove 'active' de todos os botões e 'hidden' de todas as seções
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.game-section').forEach(sec => sec.classList.add('hidden'));

            // Adiciona 'active' ao botão clicado e remove 'hidden' da seção correspondente
            e.currentTarget.classList.add('active');
            const activeSection = document.getElementById(sectionId + '-section');
            if (activeSection) {
                activeSection.classList.remove('hidden');
            }
            
            // Renderiza o conteúdo da seção (para garantir dados atualizados)
            switch(sectionId) {
                case 'album':
                    // Re-renderiza o álbum (os dados já devem estar carregados)
                    renderAlbum(); 
                    break;
                case 'shop':
                    // Re-renderiza a loja
                    renderShop(); 
                    break;
                case 'trade':
                    // TODO: Chamar renderTrade()
                    break;
                case 'minigames':
                    // TODO: Chamar renderMinigames()
                    break;
            }
        });
    });
}


// ------------------------------------
// 7. Inicialização
// ------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Configura a navegação entre as abas
    setupNavigation();
    
    // 2. Verifica a sessão do usuário e carrega os dados
    await handleAuth();
    
    // 3. O Supabase tem um listener para eventos de autenticação
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (session) {
                loadPlayerData(session.user.id);
            }
        } else if (event === 'SIGNED_OUT') {
            handleAuth(); // Chama para reverter a UI para o estado deslogado
        }
    });

    // Certifique-se de que a seção inicial (Álbum) é visível
    document.getElementById('album-section').classList.remove('hidden');
});
