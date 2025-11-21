// app.js

// Importa a instância do Supabase do seu arquivo supabaseClient-v2.js
// Certifique-se de que supabaseClient-v2.js exporta a instância Supabase
// Ex: const supabase = createClient(...)
// Você já está carregando o script no HTML, então a variável 'supabase' deve estar disponível globalmente.

let player = null; // Objeto global para armazenar os dados do jogador logado
let cardsInAlbum = []; // Array para as cartas do jogador
let packsAvailable = []; // Array para os pacotes disponíveis

const BUCKET_NAME = 'cards'; // Usado para acessar imagens

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
    // getSession é mais rápido e eficiente para checar se já tem sessão ativa ou URL de login
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session && session.user) {
        // Usuário logado!
        console.log("Usuário logado encontrado:", session.user.email);
        await loadPlayerData(session.user.id);
        updateUIForLoggedIn();
    } else {
        // Usuário deslogado
        console.log("Nenhum usuário logado.");
        updateUIForLoggedOut();
    }
}

async function loginOrSignup() {
    // Pergunta qual ação o usuário quer
    const opcao = prompt("Digite o número da opção:\n1. ENTRAR (Já tenho conta)\n2. CRIAR NOVA CONTA");
    
    if (opcao !== "1" && opcao !== "2") return;

    const email = prompt("Digite seu e-mail:");
    if (!email) return;

    const password = prompt("Crie uma senha (mínimo 6 letras/números):");
    if (!password) return;

    if (opcao === "1") {
        // --- LOGIN ---
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            alert("Erro ao entrar: " + error.message);
        } else {
            // O listener no app.js vai detectar o login e atualizar a tela sozinho
            console.log("Logado com sucesso!");
        }

    } else if (opcao === "2") {
        // --- CADASTRO ---
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: email.split('@')[0] // Usa o começo do email como nome
                }
            }
        });

        if (error) {
            alert("Erro ao criar conta: " + error.message);
        } else {
            alert("Conta criada com sucesso! Você já está logado.");
            // O listener no app.js vai detectar o login automaticamente
        }
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
    // 1. Carrega dados do jogador
    let { data: playerData, error: playerError } = await supabase
        .from('jogadores')
        .select('*')
        .eq('id', userId)
        .single();

    if (playerError && playerError.code === 'PGRST116') {
        // Cria novo jogador se não existir
        const { data: newPlayer, error: insertError } = await supabase
            .from('jogadores')
            .insert([{ id: userId, nome: 'Iniciante', email: 'user@email.com', nivel: 1, moedas: 500 }])
            .select('*')
            .single();
            
        if (insertError) { console.error(insertError); return; }
        playerData = newPlayer;
    }
    
    player = playerData;

    // 2. Carrega as cartas (Nota: agora usamos card_id referenciando cards)
    const { data: playerCardData, error: cardError } = await supabase
        .from('cartas_do_jogador')
        .select(`
            quantidade,
            card_id,
            cards ( id, name, rarity, power, image_url, element, id_base, personagens_base (origem) )
        `)
        .eq('jogador_id', userId);

    if (cardError) {
        console.error("Erro cartas:", cardError);
        cardsInAlbum = [];
    } else {
        // Mapeamento para facilitar o uso no front
        cardsInAlbum = playerCardData.map(item => {
            if (!item.cards) return null; // Proteção contra carta deletada
            return {
                ...item.cards,
                quantidade: item.quantidade
            };
        }).filter(item => item !== null);
    }

    if (packsAvailable.length === 0) await loadPacks();
    renderAlbum(); 
}

// Função corrigida para salvar cartas respeitando o RLS e UUIDs
async function updatePlayerCards(newCards) {
    if (!player || newCards.length === 0) return;
    
    // Agrupa por ID da carta (UUID)
    const updates = newCards.reduce((acc, card) => {
        acc[card.id] = (acc[card.id] || 0) + 1;
        return acc;
    }, {});
    
    for (const cardId in updates) {
        const quantityGained = updates[cardId];
        
        // Verifica no array local se já tem
        const existingCard = cardsInAlbum.find(c => c.id === cardId);
        
        if (existingCard) {
            // UPDATE
            const novaQtd = existingCard.quantidade + quantityGained;
            const { error } = await supabase
                .from('cartas_do_jogador')
                .update({ quantidade: novaQtd })
                .eq('jogador_id', player.id)
                .eq('card_id', cardId); // Note: card_id, não id_carta
            
            if (!error) existingCard.quantidade = novaQtd;
            else console.error("Erro update:", error);

        } else {
            // INSERT
            const { error } = await supabase
                .from('cartas_do_jogador')
                .insert([{
                    card_id: cardId,
                    jogador_id: player.id,
                    quantidade: quantityGained
                }]);
                
            if (!error) {
                const newCardObj = newCards.find(c => c.id === cardId);
                cardsInAlbum.push({ ...newCardObj, quantidade: quantityGained });
            } else console.error("Erro insert:", error);
        }
    }
    
    // Atualiza moedas e total no banco
    await supabase.from('jogadores')
        .update({ 
            moedas: player.moedas, // Já foi descontado localmente antes
            total_cartas: cardsInAlbum.reduce((a, b) => a + b.quantidade, 0) 
        })
        .eq('id', player.id);
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
    // 1. Configura a navegação
    setupNavigation();

    // 2. OTIMIZAÇÃO CRUCIAL: Configura o "escutador" do Supabase ANTES de checar o Auth
    // Isso garante que se o login vier pelo Link (URL), o código pegue o evento.
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("Evento de Auth disparado:", event);
        
        if (event === 'SIGNED_IN' && session) {
            // Login detectado (inclusive pelo link mágico)
            await loadPlayerData(session.user.id);
            updateUIForLoggedIn();
            
            // Opcional: Limpa a URL feia cheia de códigos
            window.history.replaceState({}, document.title, "/card-family/");
            
        } else if (event === 'SIGNED_OUT') {
            player = null;
            cardsInAlbum = [];
            updateUIForLoggedOut();
            renderAlbum();
        }
    });

    // 3. Verifica o estado inicial (caso o usuário já estivesse logado de antes)
    await handleAuth();

    // Certifique-se de que a seção inicial é visível
    document.getElementById('album-section').classList.remove('hidden');
});
