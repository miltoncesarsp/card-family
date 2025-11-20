// =======================================================
// VARIÁVEIS GLOBAIS DE ESTADO E CONFIGURAÇÃO
// =======================================================
let EVOLUTION_COSTS = {}; 
const BUCKET_NAME = 'cards'; 
let currentEditCardId = null; // ID da carta em edição
let currentEditBaseCharacterId = null; // ID do Personagem Base em edição

// =======================================================
// FUNÇÕES DE ESTILO E UTILIDADE
// =======================================================

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

// Preview da carta (Suporta URL de edição para manter a imagem)
function previewCard(imageUrl = null) {
    const name = document.getElementById("cardName").value.trim();
    const power = document.getElementById("cardPower").value;
    const rarity = document.getElementById("cardRarity").value;
    const element = "Terra"; // Valor padrão para preview
    
    const currentImageUrl = document.getElementById("currentImageUrl").value;
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    const container = document.getElementById("cardPreviewContainer");
    container.innerHTML = "";

    // O URL final é o URL passado (na chamada handleEdit) OU o URL oculto (se não houver novo arquivo)
    // Usamos o parâmetro 'imageUrl' que recebe o valor de cardData.image_url.
    const finalImageUrl = imageUrl || (currentImageUrl && !file) ? currentImageUrl : null;

    if (!name && !power && !file && !finalImageUrl) return;

    const div = document.createElement("div");
    div.className = "card-preview";

    const rarityStyles = getRarityColors(rarity);
    const elementStyles = getElementStyles(element);
    const rarityTextColor = "white";

    if (file) {
        div.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
    } else if (finalImageUrl) {
        div.style.backgroundImage = `url(${finalImageUrl})`;
    }

    div.innerHTML = `
        <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: ${rarityTextColor};">${rarity}</div>
        <div class="card-element-badge" style="background: ${elementStyles.background};">${getElementIcon(element)}</div>
        <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${name}</div>
        <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${power}</div>
    `;

    container.appendChild(div);
}

// =======================================================
// FUNÇÕES DE ADMINISTRAÇÃO E CRUD DE PERSONAGEM BASE
// =======================================================

function resetBaseFormState() {
    currentEditBaseCharacterId = null;
    document.getElementById("basePersonagem").value = "";
    document.getElementById("baseOrigem").value = "";
    document.getElementById("baseElemento").selectedIndex = 0;
    document.getElementById("saveBaseBtn").textContent = "Salvar Personagem Base";
    document.getElementById("baseForm").classList.remove("editing-mode");
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
    const baseData = { personagem, origem, elemento };

    if (isEditingBase) {
        // AÇÃO: UPDATE
        const { error: updateError } = await supabase.from("personagens_base")
            .update(baseData)
            .eq('id_base', currentEditBaseCharacterId);
        dbError = updateError;
    } else {
        // AÇÃO: INSERT
        const { error: insertError } = await supabase.from("personagens_base")
            .insert([baseData]);
        dbError = insertError;
    }


    if (dbError) {
        console.error("Erro ao salvar Base:", dbError);
        alert(`Erro ao salvar no banco (Base): ${dbError.message}`);
        return;
    }

    alert(`Personagem Base "${personagem}" ${isEditingBase ? 'atualizado' : 'salvo'} com sucesso!`);
    
    resetBaseFormState();
    await loadUnifiedView();
}

async function handleEditBaseCharacter(event) {
    const baseId = event.currentTarget.dataset.id;
    currentEditBaseCharacterId = baseId;

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

    document.getElementById("basePersonagem").value = baseData.personagem;
    document.getElementById("baseOrigem").value = baseData.origem;
    document.getElementById("baseElemento").value = baseData.elemento;
    
    document.getElementById("saveBaseBtn").textContent = "Atualizar Personagem Base";
    document.getElementById("baseForm").classList.add("editing-mode"); 
}

async function handleDeleteBaseCharacter(event) {
    const baseId = event.currentTarget.dataset.id;
    const baseName = event.currentTarget.dataset.name;

    if (confirm(`Tem certeza que deseja DELETAR o Personagem Base "${baseName}"? Isso deletará TODAS as cartas ligadas a ele e é irreversível.`)) {
        
        // Deleta as cartas primeiro (para evitar erro de FK)
        const { error: deleteCardsError } = await supabase
            .from('cards')
            .delete()
            .eq('id_base', baseId);

        if (deleteCardsError) {
            console.error("Erro ao deletar cartas ligadas:", deleteCardsError);
            alert("Erro ao deletar cartas ligadas. Verifique as permissões de RLS.");
            return;
        }

        // Agora, deleta o Personagem Base
        const { error: deleteBaseError } = await supabase
            .from('personagens_base')
            .delete()
            .eq('id_base', baseId);

        if (deleteBaseError) {
            console.error("Erro ao deletar Personagem Base:", deleteBaseError);
            alert("Erro ao deletar Personagem Base. Verifique as permissões de RLS.");
        } else {
            alert(`Personagem Base "${baseName}" e suas cartas ligadas deletados com sucesso!`);
            await loadUnifiedView(); 
        }
    }
}


// =======================================================
// FUNÇÕES DE ADMINISTRAÇÃO E CRUD DE CARTAS
// =======================================================

async function handleEdit(event) {
    const cardId = event.currentTarget.dataset.id;
    currentEditCardId = cardId; 

    const { data: cardData, error } = await supabase
        .from('cards')
        .select('*')
        .eq('id', cardId)
        .single();

    if (error || !cardData) {
        console.error("Erro ao buscar carta para edição:", error);
        alert("Erro ao carregar dados da carta para edição.");
        return;
    }

    document.getElementById("cardName").value = cardData.name;
    document.getElementById("cardPower").value = cardData.power;
    document.getElementById("cardRarity").value = cardData.rarity;
    
    document.getElementById("currentImageUrl").value = cardData.image_url;
    
    document.getElementById("saveCardBtn").textContent = "Atualizar Carta";
    document.getElementById("cardForm").classList.add("editing-mode");
    document.getElementById("cardForm").classList.add("card-form-fixed"); 
    
    previewCard(cardData.image_url); 
}

function cancelEditing() {
    resetFormState();
}

async function saveOrUpdateCard() { 
    const name = document.getElementById("cardName").value.trim();
    const rarity = document.getElementById("cardRarity").value;
    const power = parseInt(document.getElementById("cardPower").value);
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];
    
    const isEditing = currentEditCardId !== null;
    let imageUrlToSave = null; 

    if (!name || !rarity || !power) {
        alert("Preencha Nome, Raridade e Força!");
        return;
    }
    
    if (!isEditing && !file) {
        alert("Selecione uma imagem para a nova carta!");
        return;
    }
    
    // 1. Busca ID_BASE e Elemento
    const { data: baseDataArray, error: baseError } = await supabase
        .from("personagens_base")
        .select("id_base, elemento")
        .ilike("personagem", name)
        .limit(1);

    if (baseError || !baseDataArray || baseDataArray.length === 0) {
        console.error("Erro ao buscar base:", baseError || "Personagem não encontrado.");
        alert("Não foi possível encontrar o Personagem Base! Crie-o primeiro.");
        return;
    }

    const { id_base, elemento } = baseDataArray[0];
    
    
    // 2. Lógica de Manter ou Trocar a Imagem
    if (file) {
        // Upload de nova imagem
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
    } else if (isEditing) {
        // Se não houve novo arquivo, e estamos editando, mantém o URL existente
        // O URL foi carregado no campo oculto (currentImageUrl) pelo handleEdit
        imageUrlToSave = document.getElementById("currentImageUrl").value;
    } 
    
    // 3. Monta o objeto de dados
    const cardData = {
        name,
        rarity,
        element: elemento,
        power,
        id_base: id_base,
        image_url: imageUrlToSave // <-- CORRIGIDO: Usa a variável final
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
    
    resetFormState(); 
    await loadUnifiedView();
}

// =======================================================
// FUNÇÃO DE VISUALIZAÇÃO UNIFICADA
// =======================================================

async function loadUnifiedView() {
    const listContainer = document.getElementById("unifiedListContainer");
    listContainer.innerHTML = "Carregando dados unificados...";

    if (Object.keys(EVOLUTION_COSTS).length === 0) {
        await loadEvolutionCosts();
    }

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
    
    if (!baseData || baseData.length === 0) {
        listContainer.innerHTML = "Nenhum Personagem Base cadastrado.";
        return;
    }

    updateNameDatalist(baseData);

    const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];
    let outputHTML = '';

    const groupedByOrigin = baseData.reduce((acc, base) => {
        (acc[base.origem] = acc[base.origem] || []).push(base);
        return acc;
    }, {});

    for (const [origem, personagensArray] of Object.entries(groupedByOrigin)) {
        outputHTML += `<h3 class="group-title">${origem}</h3>`;

        personagensArray.forEach(base => {
            const baseElementStyles = getElementStyles(base.elemento);
            
            outputHTML += `<div class="personagem-base-container">`;
            
            // TÍTULO COM BOTÕES DE EDIÇÃO/DELEÇÃO DO PERSONAGEM BASE
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
            
            base.cards.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));

            if (base.cards.length === 0) {
                outputHTML += `<p class="base-details" style="margin-left: 10px;">Nenhuma carta criada para este personagem.</p>`;
            } else {
                base.cards.forEach(card => { 
                    const rarityStyles = getRarityColors(card.rarity);
                    const custo = EVOLUTION_COSTS[card.rarity];
                    const custoTexto = (card.rarity === 'Mítica' || custo === 0) ? "Máximo" : (custo ? `${custo}x` : "N/A");
                    
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
            } 
            
            outputHTML += `</div></div>`; // Fecha card-group-container e personagem-base-container
        });
    }

    listContainer.innerHTML = outputHTML;
    
    // 6. Adiciona Listeners (DEVE SER FEITO AQUI, APÓS O innerHTML)
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', handleDelete);
    });
    document.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', handleEdit); 
    });
    document.querySelectorAll('.edit-base-btn').forEach(button => {
        button.addEventListener('click', handleEditBaseCharacter);
    });
    document.querySelectorAll('.delete-base-btn').forEach(button => {
        button.addEventListener('click', handleDeleteBaseCharacter);
    });
}
