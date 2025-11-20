let EVOLUTION_COSTS = {}; // Será preenchido com dados do DB
const BUCKET_NAME = 'cards'; // Assumindo que seu bucket se chama 'cards'
let currentEditCardId = null; 
let currentEditBaseCharacterId = null; // NOVO: Para edição de Personagem Base

function compressImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const MAX_WIDTH = 600;
            const scale = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
        };
    });
}

// Ícone Font Awesome do elemento
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

async function handleEdit(event) {
    const cardId = event.currentTarget.dataset.id;
    currentEditCardId = cardId; // Define o ID para a edição

    // 1. Buscar dados da carta
    const { data: cardData, error } = await supabase
        .from('cards')
        .select('*') // Seleciona todos os campos
        .eq('id', cardId)
        .single();

    if (error || !cardData) {
        console.error("Erro ao buscar carta para edição:", error);
        alert("Erro ao carregar dados da carta para edição.");
        return;
    }

    // 2. Preencher o formulário
    document.getElementById("cardName").value = cardData.name;
    document.getElementById("cardPower").value = cardData.power;
    document.getElementById("cardRarity").value = cardData.rarity;
    
    // O Elemento é derivado do Personagem Base, então não precisamos preenchê-lo
    
    // 3. Atualizar botões e visual
    document.getElementById("saveCardBtn").textContent = "Atualizar Carta";
    document.getElementById("cardForm").classList.add("editing-mode"); // Adiciona classe para estilizar
    
    // O fileInput não pode ser preenchido por questões de segurança, mas disparamos o preview
    // Se a carta tem uma imagem_url, a gente pré-visualiza usando um método temporário.
    previewCard(cardData.image_url); 
}

// Preview da carta
function previewCard(imageUrl = null) {
    const name = document.getElementById("cardName").value.trim();
    const power = document.getElementById("cardPower").value;
    const rarity = document.getElementById("cardRarity").value;
    const element = "Terra"; // Valor padrão para preview
    
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    const container = document.getElementById("cardPreviewContainer");
    container.innerHTML = "";

    if (!name && !power && !file && !imageUrl) return;

    const div = document.createElement("div");
    div.className = "card-preview";

    const rarityStyles = getRarityColors(rarity);
    const elementStyles = getElementStyles(element);
    const rarityTextColor = "white";

    // NOVIDADE: Verifica se há um URL para pré-visualização (caso de edição)
    if (file) {
        div.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
    } else if (imageUrl) {
        div.style.backgroundImage = `url(${imageUrl})`;
    }

    div.innerHTML = `
        <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: ${rarityTextColor};">${rarity}</div>
        <div class="card-element-badge" style="background: ${elementStyles.background};">${getElementIcon(element)}</div>
        <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${name}</div>
        <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${power}</div>
    `;

    container.appendChild(div);
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
// Upload da carta
async function saveOrUpdateCard() {
    const name = document.getElementById("cardName").value.trim();
    const rarity = document.getElementById("cardRarity").value;
    const power = parseInt(document.getElementById("cardPower").value);
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];
    
    const isEditing = currentEditCardId !== null;
    let existingImageUrl = null; // Para armazenar a URL da imagem existente ao editar

    if (!name || !rarity || !power) {
        alert("Preencha Nome, Raridade e Força!");
        return;
    }
    
    // Se for um novo card, a imagem é obrigatória
    // Se for edição E não há novo arquivo, a imagem NÃO é obrigatória, usaremos a existente
    if (!isEditing && !file) {
        alert("Selecione uma imagem para a nova carta!");
        return;
    }

    // 1. Busca ID_BASE (Necessário para a inserção/update, e para o elemento)
    const { data: baseDataArray, error: baseError } = await supabase
        .from("personagens_base")
        .select("id_base, origem, elemento")
        // No modo de edição, podemos buscar a carta pelo ID para obter o nome original
        // Ou, para simplificar, continuamos buscando pelo nome atual do input
        // Se o nome do personagem for mudado durante a edição da carta, isso pode ser um problema.
        // Por ora, vamos assumir que o "name" no formulário de carta se refere ao "personagem" base.
        .ilike("personagem", name) // Continua usando o nome do input
        .limit(1);

    if (baseError || !baseDataArray || baseDataArray.length === 0) {
        console.error("Erro ao buscar base:", baseError || "Personagem não encontrado.");
        alert("Não foi possível encontrar o Personagem Base! Crie-o primeiro.");
        return;
    }

    const { id_base, elemento } = baseDataArray[0];
    let imageUrlToSave = null; // Variável que conterá o URL final da imagem

    // Se estiver editando, busca a URL da imagem atual da carta
    if (isEditing) {
        const { data: existingCard, error: existingCardError } = await supabase
            .from('cards')
            .select('image_url')
            .eq('id', currentEditCardId)
            .single();

        if (existingCardError) {
            console.error("Erro ao buscar URL da imagem existente:", existingCardError);
            alert("Erro ao verificar imagem existente da carta.");
            return;
        }
        existingImageUrl = existingCard ? existingCard.image_url : null;
    }

    // 2. Lógica de Upload da imagem (SÓ SE UMA NOVA IMAGEM FOR SELECIONADA)
    if (file) {
        const compressed = await compressImage(file);
        const uniqueFileName = `${id_base}_${rarity}_${Date.now()}.jpeg`;
        const filePath = `${id_base}/${uniqueFileName}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, compressed, { cacheControl: '3600', upsert: false });

        if (uploadError) {
            console.error("Erro no upload da imagem:", uploadError);
            alert(`Erro ao enviar a imagem: ${uploadError.message}`);
            return;
        }

        const { data: publicUrlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        imageUrlToSave = publicUrlData.publicUrl;
    } else {
        // Se não houver novo arquivo, e estiver editando, mantém a imagem existente
        imageUrlToSave = existingImageUrl;
    }
    
    // 3. Monta o objeto de dados
    const cardData = {
        name,
        rarity,
        element: elemento, // O elemento é do Personagem Base
        power,
        id_base: id_base,
        image_url: imageUrlToSave // Usa o URL final da imagem
    };
    
    let dbError;

    if (isEditing) {
        // AÇÃO: UPDATE
        const { error: updateError } = await supabase.from("cards")
            .update(cardData)
            .eq('id', currentEditCardId);
        dbError = updateError;
    } else {
        // AÇÃO: INSERT (NOVO CARD)
        const { error: insertError } = await supabase.from("cards")
            .insert([cardData]);
        dbError = insertError;
    }

    if (dbError) {
        console.error("Erro ao salvar/atualizar no banco:", dbError);
        alert("Erro ao salvar/atualizar no banco! (Verifique RLS e colunas)");
        return;
    }

    alert(`Carta ${isEditing ? 'atualizada' : 'salva'} com sucesso!`);
    
    // 4. Limpar e recarregar
    resetFormState(); 
    await loadUnifiedView();
}
/**
 * Busca e exibe as cartas agrupadas por Origem.
 */
async function loadCards() {
    const listContainer = document.getElementById("cardListContainer");
    listContainer.innerHTML = "Carregando cartas...";

    const { data: cards, error: cardsError } = await supabase
        .from("cards")
        .select(`
            *,
            personagens_base (
                origem,
                personagem,
                elemento
            )
        `);

    if (cardsError) {
        console.error("Erro ao buscar cartas:", cardsError);
        listContainer.innerHTML = "Erro ao carregar as cartas.";
        return;
    }
    if (!cards || cards.length === 0) {
        listContainer.innerHTML = "Nenhuma carta cadastrada.";
        return;
    }

    // Agrupamento em Níveis: Origem -> Personagem -> Cartas
    const groupedByOriginAndPersonagem = cards.reduce((acc, card) => {
        const origem = card.personagens_base ? card.personagens_base.origem : "Desconhecida";
        const personagem = card.personagens_base ? card.personagens_base.personagem : "Desconhecido";

        acc[origem] = acc[origem] || {};
        acc[origem][personagem] = acc[origem][personagem] || [];
        acc[origem][personagem].push(card);
        return acc;
    }, {});


    // Renderiza na tela
    listContainer.innerHTML = "";
    
    // Iteração Nível 1: Origem
    for (const [origem, personagens] of Object.entries(groupedByOriginAndPersonagem).sort(([a], [b]) => a.localeCompare(b))) {
        listContainer.innerHTML += `<h3 class="group-title">${origem}</h3>`;
        
        // Iteração Nível 2: Personagem
        for (const [personagem, cardArray] of Object.entries(personagens).sort(([a], [b]) => a.localeCompare(b))) {
            
            listContainer.innerHTML += `<h4 class="sub-title">${personagem}</h4>`;
            listContainer.innerHTML += `<div class="card-group-container card-evolution-line">`; 

            // Ordena por Raridade
            const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];
            cardArray.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));

            // Iteração Nível 3: Renderização do Card
cardArray.forEach(card => { // <-- AQUI O OBJETO 'card' É CRIADO
    const rarityStyles = getRarityColors(card.rarity);
    const elemento = card.personagens_base ? card.personagens_base.elemento : "Desconhecido";
    const elementStyles = getElementStyles(elemento);
    const custo = EVOLUTION_COSTS[card.rarity];
    const custoTexto = (card.rarity === 'Mítica' || custo === 0) ? "Máximo" : (custo ? `${custo}x` : "N/A");

    // O BLOCO DE HTML DA CARTA DEVE ESTAR AQUI:
    listContainer.innerHTML += `
        <div class="card-preview card-small card-editable" data-card-id="${card.id}" data-card-name="${card.name}">
            <div class="card-management-buttons">
                <button class="edit-btn" data-id="${card.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-btn" data-id="${card.id}" data-name="${card.name}"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="card-content-wrapper">
                <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">${card.rarity}</div>
                <div class="card-element-badge" style="background: ${elementStyles.background};">${getElementIcon(elemento)}</div>
                <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
                <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${card.power}</div>
            </div>
            <div class="evolution-cost">Próxima Evolução: ${custoTexto}</div>
        </div>
    `; // <-- TUDO DEVE ESTAR ENCAPSULADO AQUI
            });
            
            listContainer.innerHTML += `</div>`; // Fecha card-group-container
        }
    }
}

async function saveBasePersonagem() {
    const personagem = document.getElementById("basePersonagem").value.trim();
    const origem = document.getElementById("baseOrigem").value.trim();
    const elemento = document.getElementById("baseElemento").value;

    const isEditingBase = currentEditBaseCharacterId !== null;

    if (!personagem || !origem || !elemento) {
        alert("Preencha todos os campos do formulário Base!");
        return;
    }

    let dbError;

    if (isEditingBase) {
        // AÇÃO: UPDATE
        const { error: updateError } = await supabase.from("personagens_base")
            .update({ personagem, origem, elemento })
            .eq('id_base', currentEditBaseCharacterId);
        dbError = updateError;
    } else {
        // AÇÃO: INSERT
        const { error: insertError } = await supabase.from("personagens_base")
            .insert([{ personagem, origem, elemento }]);
        dbError = insertError;
    }

    if (dbError) {
        console.error("Erro ao salvar Base:", dbError);
        alert(`Erro ao salvar no banco (Base): ${dbError.message}`);
        return;
    }

    alert(`Personagem Base "${personagem}" ${isEditingBase ? 'atualizado' : 'salvo'} com sucesso!`);
    
    // Limpeza e redefinição do estado
    resetBaseFormState(); // Criaremos essa função
    await loadUnifiedView(); 
}

async function loadBaseCharacters() {
    const listContainer = document.getElementById("baseListContainer");
    if (!listContainer) return;

    listContainer.innerHTML = "Carregando personagens base e suas cartas...";

    const { data: baseData, error } = await supabase
        .from("personagens_base")
        .select(`
            id_base,
            personagem,
            origem,
            elemento,
            cards (
                id,
                name,
                rarity,
                power,
                image_url
            )
        `)
        .order("origem", { ascending: true })
        .order("personagem", { ascending: true }); 

    if (error) {
        console.error("Erro ao carregar personagens base:", error);
        listContainer.innerHTML = "Erro ao carregar a lista de personagens base.";
        return;
    }

    if (!baseData || baseData.length === 0) {
        listContainer.innerHTML = "Nenhum personagem base cadastrado.";
        return;
    }

    // Renderiza os dados
    listContainer.innerHTML = baseData.map(base => {
        const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];
        base.cards.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));

        const cardListHTML = base.cards.length > 0 ?
            base.cards.map(card => {
                const rarityStyles = getRarityColors(card.rarity);
                const elementStyles = getElementStyles(base.elemento);
                
                return `
                    <div class="card-base-small" style="background-color: #f7f7f7; border: 1px solid ${rarityStyles.primary};">
                        <span class="base-small-name">
                            ${card.name} 
                            <span class="base-small-element" style="background: ${elementStyles.background};">
                                ${getElementIcon(base.elemento)}
                            </span>
                        </span>
                        <span class="base-small-rarity" style="background-color: ${rarityStyles.primary};">
                            ${card.rarity} (${card.power} POW)
                        </span>
                    </div>
                `;
            }).join('') :
            '<p class="no-cards">Nenhuma carta ligada a este personagem.</p>';

        return `
            <div class="base-character-item">
                <h4 class="base-character-header">
                    ${base.personagem} (${base.origem}) - Elemento: ${base.elemento} (ID: ${base.id_base})
                </h4>
                <div class="linked-cards-container">
                    ${cardListHTML}
                </div>
            </div>
            <hr class="base-hr">
        `;
    }).join('');
}

/**
 * Preenche a datalist de autocompletar com nomes de personagens base.
 * @param {Array<Object>} baseCharacters Lista de personagens_base.
 */
function updateNameDatalist(baseCharacters) {
    const datalist = document.getElementById('personagem-nomes');
    if (!datalist) return;
    
    datalist.innerHTML = baseCharacters.map(base => 
        `<option value="${base.personagem}">`
    ).join('');
}

async function loadUnifiedView() {
    const listContainer = document.getElementById("unifiedListContainer");
    listContainer.innerHTML = "Carregando dados unificados...";

    // 1. Garante que os custos de evolução estejam carregados
    // (A função loadEvolutionCosts deve ser chamada no DOMContentLoaded e salva em EVOLUTION_COSTS)
    if (Object.keys(EVOLUTION_COSTS).length === 0) {
        await loadEvolutionCosts();
    }

    // 2. Busca de dados (Personagem Base + Cartas Ligadas)
    const { data: baseData, error } = await supabase
        .from("personagens_base")
        .select(`
            id_base,
            personagem,
            origem,
            elemento,
            cards (
                id,
                name,
                rarity,
                power,
                image_url
            )
        `)
        .order("origem", { ascending: true })
        .order("personagem", { ascending: true }); 

    if (error) {
        console.error("Erro ao carregar dados unificados:", error);
        listContainer.innerHTML = "Erro ao carregar os dados de evolução. (Verifique RLS e conexão)";
        return;
    }
    
    // 3. Verifica se há dados e preenche o Datalist (Autocompletar)
    if (!baseData || baseData.length === 0) {
        listContainer.innerHTML = "Nenhum Personagem Base cadastrado.";
        return;
    }
    updateNameDatalist(baseData); // Função que preenche o datalist para o autocompletar

    // 4. Agrupamento Hierárquico (Origem -> Personagem)
    const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];
    let outputHTML = '';

    const groupedByOrigin = baseData.reduce((acc, base) => {
        (acc[base.origem] = acc[base.origem] || []).push(base);
        return acc;
    }, {});

    // 5. Renderização (Hierarquia + Cartões)
    for (const [origem, personagensArray] of Object.entries(groupedByOrigin)) {
        outputHTML += `<h3 class="group-title">${origem}</h3>`; // Nível 1: Origem
        
        personagensArray.forEach(base => {
            const baseElementStyles = getElementStyles(base.elemento);
            
            outputHTML += `<div class="personagem-base-container">`;
            
            // Título do Personagem Base
            outputHTML += `<h4 class="sub-title" style="border-left-color: ${baseElementStyles.primary};">
                ${base.personagem} 
                <span class="base-details">
                    (ID: ${base.id_base} | Elemento: ${base.elemento})
                </span>
                <div class="base-management-buttons">
                    <button class="edit-base-btn" data-id="${base.id_base}"><i class="fas fa-edit"></i></button>
                    <button class="delete-base-btn" data-id="${base.id_base}" data-name="${base.personagem}"><i class="fas fa-trash-alt"></i></button>
                </div>
            </h4>`;
            
            outputHTML += `<div class="card-group-container card-evolution-line">`;
            
            // Ordena as cartas pela linha de evolução
            base.cards.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));

            // Renderização das Cartas (Nível 3)
            if (base.cards.length === 0) {
                outputHTML += `<p class="base-details" style="margin-left: 10px;">Nenhuma carta criada para este personagem.</p>`;
            } else {
                base.cards.forEach(card => { 
                    const rarityStyles = getRarityColors(card.rarity);
                    const custo = EVOLUTION_COSTS[card.rarity];
                    const custoTexto = (card.rarity === 'Mítica' || custo === 0) ? "Máximo" : (custo ? `${custo}x` : "N/A");
                    
                    // Injeção do Card HTML com Botões de Gerenciamento
                    outputHTML += `
                        <div class="card-preview card-small card-editable" 
                             data-card-id="${card.id}" 
                             data-card-name="${card.name}"
                             style="background-image: url('${card.image_url}');" 
                        >
                            <div class="card-management-buttons">
                                <button class="edit-btn" data-id="${card.id}"><i class="fas fa-edit"></i></button>
                                <button class="delete-btn" data-id="${card.id}" data-name="${card.name}"><i class="fas fa-trash-alt"></i></button>
                            </div>
                            <div class="card-content-wrapper">
                                <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">${card.rarity}</div>
                                <div class="card-element-badge" style="background: ${baseElementStyles.background};">${getElementIcon(base.elemento)}</div>
                                <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
                                <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${card.power}</div>
                            </div>
                            <div class="evolution-cost">
                                Próxima Evolução: ${custoTexto}
                            </div>
                        </div>
                    `;
                });
            } // Fim do if/else de cartas
            
            outputHTML += `</div></div>`; // Fecha card-group-container e personagem-base-container
        });
    }

    listContainer.innerHTML = outputHTML;
    
    // 6. Adiciona Listeners para Deleção e Edição (Funções que você implementou)
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', handleDelete);
    });
    document.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', handleEdit); 
    });
}

async function handleDelete(event) {
    const cardId = event.currentTarget.dataset.id;
    const cardName = event.currentTarget.dataset.name;

    if (confirm(`Tem certeza que deseja DELETAR a carta ${cardName}? Isso é irreversível.`)) {
        const { error } = await supabase
            .from('cards')
            .delete()
            .eq('id', cardId);

        if (error) {
            console.error("Erro ao deletar carta:", error);
            alert("Erro ao deletar carta. Verifique as permissões de RLS.");
        } else {
            alert(`Carta ${cardName} deletada com sucesso!`);
            await loadUnifiedView(); // Recarrega a visualização unificada
        }
    }
}

async function loadEvolutionCosts() {
    const { data, error } = await supabase
        .from('regras_raridade')
        .select('raridade_nome, repetidas_para_evoluir');

    if (error) {
        console.error("Erro ao carregar custos de evolução:", error);
        return;
    }

    EVOLUTION_COSTS = data.reduce((acc, rule) => {
        acc[rule.raridade_nome] = rule.repetidas_para_evoluir;
        return acc;
    }, {});
}

function resetBaseFormState() {
    currentEditBaseCharacterId = null;
    document.getElementById("basePersonagem").value = "";
    document.getElementById("baseOrigem").value = "";
    document.getElementById("baseElemento").selectedIndex = 0;
    document.getElementById("saveBaseBtn").textContent = "Salvar Personagem Base";
    document.getElementById("baseFormContainer").classList.remove("editing-mode");
}

async function handleEditBaseCharacter(event) {
    const baseId = event.currentTarget.dataset.id;
    currentEditBaseCharacterId = baseId;

    // 1. Buscar dados do Personagem Base
    const { data: baseData, error } = await supabase
        .from('personagens_base')
        .select('*')
        .eq('id_base', baseId)
        .single();

    if (error || !baseData) {
        console.error("Erro ao buscar Personagem Base para edição:", error);
        alert("Erro ao carregar dados do Personagem Base para edição.");
        return;
    }

    // 2. Preencher o formulário de Personagem Base
    document.getElementById("basePersonagem").value = baseData.personagem;
    document.getElementById("baseOrigem").value = baseData.origem;
    document.getElementById("baseElemento").value = baseData.elemento;
    
    // 3. Atualizar botões e visual do formulário (se houver)
    document.getElementById("saveBaseBtn").textContent = "Atualizar Personagem Base";
    document.getElementById("baseFormContainer").classList.add("editing-mode"); // Adicione uma classe para estilizar
}

function resetFormState() {
    currentEditCardId = null;
    document.getElementById("cardForm").reset(); // Limpa os campos
    document.getElementById("saveCardBtn").textContent = "Salvar Carta";
    document.getElementById("cardForm").classList.remove("editing-mode");
    document.getElementById("cardPreviewContainer").innerHTML = ""; // Limpa o preview
}

// Listeners
document.getElementById("fileInput").addEventListener("change", previewCard);
document.getElementById("cardName").addEventListener("input", previewCard);
document.getElementById("cardPower").addEventListener("input", previewCard);
document.getElementById("cardRarity").addEventListener("change", previewCard);

document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', handleDelete);
    });
    document.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', handleEdit); 
    });

    // NOVO: Adiciona Listeners para Deleção e Edição de PERSONAGEM BASE
    document.querySelectorAll('.edit-base-btn').forEach(button => {
        button.addEventListener('click', handleEditBaseCharacter);
    });
    // Você precisará de uma função handleDeleteBaseCharacter similar à de cartas
    document.querySelectorAll('.delete-base-btn').forEach(button => {
        button.addEventListener('click', handleDeleteBaseCharacter); // Crie esta função
    });

document.getElementById("saveBaseBtn").addEventListener("click", saveBasePersonagem);

document.getElementById("saveCardBtn").addEventListener("click", async () => {
await saveOrUpdateCard(); // USE A NOVA FUNÇÃO
});

document.addEventListener("DOMContentLoaded", async () => {
    // É mais seguro chamar loadEvolutionCosts aqui para que ele esteja disponível
    await loadEvolutionCosts(); 
    loadUnifiedView(); // loadUnifiedView agora depende dos custos
});




