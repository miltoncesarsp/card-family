let EVOLUTION_COSTS = {}; // Será preenchido com dados do DB

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

// Preview da carta
function previewCard() {
    const name = document.getElementById("cardName").value.trim();
    const power = document.getElementById("cardPower").value;
    const rarity = document.getElementById("cardRarity").value;
    const element = "Terra"; // Valor padrão para preview
    
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    const container = document.getElementById("cardPreviewContainer");
    container.innerHTML = "";

    if (!name && !power && !file) return;

    const div = document.createElement("div");
    div.className = "card-preview";

    const rarityStyles = getRarityColors(rarity);
    const elementStyles = getElementStyles(element);
    const rarityTextColor = "white";

    if (file) div.style.backgroundImage = `url(${URL.createObjectURL(file)})`;

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
async function uploadCard() {
const name = document.getElementById("cardName").value.trim();
    const rarity = document.getElementById("cardRarity").value;
    const power = parseInt(document.getElementById("cardPower").value);
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

if (!name || !rarity || !power || !file) {
        alert("Preencha Nome, Raridade, Força e selecione uma imagem!");
        return;
    }

    // 1. Busca o ID_BASE, origem e elemento (CORRETO)
    const { data: baseDataArray, error: baseError } = await supabase
        .from("personagens_base")
        .select("id_base, origem, elemento")
        .ilike("personagem", name) // Correção para Case-Insensitive
        .limit(1);

    if (baseError || !baseDataArray || baseDataArray.length === 0) {
        console.error("Erro ao buscar base:", baseError || "Personagem não encontrado.");
        alert("Não foi possível encontrar o Personagem Base! Crie-o primeiro.");
        return;
    }

const { id_base, origem, elemento } = baseDataArray[0];
    
    // 2. Upload da imagem
    const compressed = await compressImage(file);
    const filePath = `cards/${origem}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
        .from("cards")
        .upload(filePath, compressed);

    if (uploadError) {
        console.error("Erro no upload:", uploadError);
        alert("Erro ao enviar imagem!");
        return;
    }

    const { data: publicUrl } = supabase.storage.from("cards").getPublicUrl(filePath);
const imageUrl = publicUrl.publicUrl;
    
    // 3. Inserção na tabela 'cards'
const { error: dbError } = await supabase.from("cards")
    .insert([{ 
        name, 
        rarity, 
        element: elemento, // <-- CORRIGIDO: Mapeia o valor 'elemento' para a coluna 'element'
        power, 
        image_url: imageUrl, 
        id_base: id_base 
    }]);

    if (dbError) {
        console.error("Erro ao salvar no banco:", dbError);
        alert("Erro ao salvar no banco!");
        return;
    }

    alert("Carta salva com sucesso!");
    document.getElementById("cardName").value = "";
    document.getElementById("cardPower").value = "";
    document.getElementById("fileInput").value = "";
    document.getElementById("cardPreviewContainer").innerHTML = "";

    await loadCards(); // Recarrega a lista de cartas
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
            cardArray.forEach(card => {
                const rarityStyles = getRarityColors(card.rarity);
                const elemento = card.personagens_base ? card.personagens_base.elemento : "Desconhecido";
                const elementStyles = getElementStyles(elemento);

                listContainer.innerHTML += `
                    <div class="card-preview card-small" 
                        style="background-image: url(${card.image_url}); 
                               border: 3px solid ${rarityStyles.primary};">

                        <div class="rarity-badge"  
                            style="background-color: ${rarityStyles.primary}; 
                                   color: white;">
                            ${card.rarity}
                        </div>
                        
                        <div class="card-element-badge"
                            style="background: ${elementStyles.background};">
                            ${getElementIcon(elemento)}
                        </div>

                        <div class="card-name-footer" 
                            style="background-color: ${rarityStyles.primary}">
                            ${card.name}
                        </div>
                        
                        <div class="card-force-circle"
                            style="background-color: ${rarityStyles.primary};
                                   color: white; 
                                   border-color: white;"> 
                            ${card.power}
                        </div>
                    </div>
                `;
            });
            
            listContainer.innerHTML += `</div>`; // Fecha card-group-container
        }
    }
}

async function saveBasePersonagem() {
    const personagem = document.getElementById("basePersonagem").value.trim();
    const origem = document.getElementById("baseOrigem").value.trim();
    const elemento = document.getElementById("baseElemento").value;

    if (!personagem || !origem || !elemento) {
        alert("Preencha todos os campos do formulário Base!");
        return;
    }

    const { error: dbError } = await supabase.from("personagens_base")
        .insert([{ personagem, origem, elemento }]);

    if (dbError) {
        console.error("Erro ao salvar Base:", dbError);
        alert(`Erro ao salvar no banco (Base): ${dbError.message}`);
        return;
    }

    alert(`Personagem Base "${personagem}" salvo com sucesso!`);
    
    // LIMPEZA MANUAL
    document.getElementById("basePersonagem").value = "";
    document.getElementById("baseOrigem").value = "";
    document.getElementById("baseElemento").selectedIndex = 0;

    await loadBaseCharacters(); // Recarrega a lista de personagens base
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

    // NOVO: GARANTE QUE OS CUSTOS ESTÃO CARREGADOS
    if (Object.keys(EVOLUTION_COSTS).length === 0) {
        await loadEvolutionCosts();
    }

    // 1. Busca todos os personagens base e faz o JOIN com todas as cartas ligadas
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
        listContainer.innerHTML = "Erro ao carregar os dados de evolução.";
        return;
    }
    
    if (!baseData || baseData.length === 0) {
        listContainer.innerHTML = "Nenhum Personagem Base cadastrado.";
        return;
    }

    // 2. Preenche o Datalist (Autocompletar)
    updateNameDatalist(baseData); 

    // 3. Renderiza a Hierarquia
    const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];
    let outputHTML = '';

    const groupedByOrigin = baseData.reduce((acc, base) => {
        (acc[base.origem] = acc[base.origem] || []).push(base);
        return acc;
    }, {});

    for (const [origem, personagensArray] of Object.entries(groupedByOrigin)) {
        outputHTML += `<h3 class="group-title">${origem}</h3>`; // Origem
        
        personagensArray.forEach(base => {
            const baseElementStyles = getElementStyles(base.elemento);
            
            outputHTML += `<div class="personagem-base-container">`;
            
            // Título do Personagem Base (Inclui Elemento e ID)
            outputHTML += `<h4 class="sub-title" style="border-left-color: ${baseElementStyles.primary};">
                ${base.personagem} 
                <span class="base-details">
                    (ID: ${base.id_base} | Elemento: ${base.elemento})
                </span>
            </h4>`;
            
            outputHTML += `<div class="card-group-container card-evolution-line">`;
            
            // Ordena as cartas pela linha de evolução
            base.cards.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));

            base.cards.forEach(card => {
        const rarityStyles = getRarityColors(card.rarity);
        const custo = EVOLUTION_COSTS[card.rarity];
        
        // Define o texto do custo
        let custoTexto;
        if (card.rarity === 'Mítica' || custo === 0) {
             custoTexto = "Máximo";
        } else if (custo) {
             custoTexto = `${custo}x`;
        } else {
             custoTexto = "N/A";
        }
                
                // Renderização da Carta (com botões de Gestão e Custo)
                outputHTML += `
                    <div class="card-preview card-small card-editable" data-card-id="${card.id}" data-card-name="${card.name}">
                        <div class="card-management-buttons">
                            <button class="edit-btn" data-id="${card.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="delete-btn" data-id="${card.id}" data-name="${card.name}">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                        <div class="card-content-wrapper">
                            <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">${card.rarity}</div>
                            <div class="card-element-badge" style="background: ${baseElementStyles.background};">${getElementIcon(base.elemento)}</div>
                            <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
                            <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${card.power}</div>
                        </div>
                        <div class="evolution-cost">
                            Próxima Evolução: ${custo}x
                        </div>
                    </div>
                `;
            });
            
            outputHTML += `
            <div class="card-preview card-small card-editable" data-card-id="${card.id}" data-card-name="${card.name}">
                <div class="evolution-cost">
                    Próxima Evolução: ${custoTexto}
                </div>
            </div>
        `;
        });
    }

    listContainer.innerHTML = outputHTML;
    
    // 4. Adiciona Listeners para botões de Deleção/Edição
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', handleDelete);
    });
    // Implementação da Edição é mais complexa e requer uma função separada (handleEdit)
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

    // Transforma o array em um objeto de acesso rápido: { "Comum": 2, "Rara": 3, ... }
    EVOLUTION_COSTS = data.reduce((acc, rule) => {
        acc[rule.raridade_nome] = rule.repetidas_para_evoluir;
        return acc;
    }, {});
}

// Listeners
document.getElementById("fileInput").addEventListener("change", previewCard);
document.getElementById("cardName").addEventListener("input", previewCard);
document.getElementById("cardPower").addEventListener("input", previewCard);
document.getElementById("cardRarity").addEventListener("change", previewCard);

// Listener para salvar base e recarregar a lista de base
document.getElementById("saveBaseBtn").addEventListener("click", saveBasePersonagem);

document.getElementById("saveCardBtn").addEventListener("click", async () => {
    await uploadCard();
    await loadUnifiedView(); // Chama a função unificada
});

document.addEventListener("DOMContentLoaded", () => {
    loadUnifiedView(); // Chama a função unificada
});




