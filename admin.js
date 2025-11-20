let EVOLUTION_COSTS = {}; 
const BUCKET_NAME = 'cards'; 
let currentEditCardId = null; 
let currentEditBaseCharacterId = null; 
let currentEditRarityName = null; 
let currentEditPackId = null; 
let currentEditPlayerId = null;

// FUNÇÕES AUXILIARES
function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

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

/**
 * Preenche a datalist de autocompletar com nomes de personagens base.
 * (CORRIGIDO: Esta função estava faltando na última versão enviada pelo usuário)
 * @param {Array<Object>} baseCharacters Lista de personagens_base.
 */
function updateNameDatalist(baseCharacters) {
    const datalist = document.getElementById('personagem-nomes');
    if (!datalist) return;
    
    datalist.innerHTML = baseCharacters.map(base => 
        `<option value="${base.personagem}">`
    ).join('');
}


/* === FUNÇÕES DE CARTAS E PERSONAGEM BASE === */

async function handleEdit(event) {
    const cardId = event.currentTarget.dataset.id;
    currentEditCardId = cardId;
    const { data: cardData, error } = await supabase.from('cards').select('*').eq('id', cardId).single();
    if (error || !cardData) { console.error("Erro ao buscar carta para edição:", error); alert("Erro ao carregar dados da carta."); return; }
    document.getElementById("cardName").value = cardData.name;
    document.getElementById("cardPower").value = cardData.power;
    document.getElementById("cardRarity").value = cardData.rarity;
    document.getElementById("saveCardBtn").textContent = "Atualizar Carta";
    document.getElementById("cardForm").classList.add("editing-mode", "card-form-fixed");
    document.getElementById("cancelEditBtn").style.display = 'inline-block';
    previewCard(cardData.image_url);
}

function cancelEditCard() {
    resetFormState();
    document.getElementById("cancelEditBtn").style.display = 'none';
}


function previewCard(imageUrl = null) {
    const name = document.getElementById("cardName").value.trim();
    const power = document.getElementById("cardPower").value;
    const rarity = document.getElementById("cardRarity").value;
    const element = "Terra";
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


async function saveOrUpdateCard() {
    const name = document.getElementById("cardName").value.trim();
    const rarity = document.getElementById("cardRarity").value;
    const power = parseInt(document.getElementById("cardPower").value);
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];
    const isEditing = currentEditCardId !== null;
    let existingImageUrl = null;

    if (!name || !rarity || !power) { alert("Preencha Nome, Raridade e Força!"); return; }
    if (!isEditing && !file) { alert("Selecione uma imagem para a nova carta!"); return; }

    const { data: baseDataArray, error: baseError } = await supabase
        .from("personagens_base")
        .select("id_base, origem, elemento")
        .ilike("personagem", name)
        .limit(1);

    if (baseError || baseDataArray.length === 0) {
        console.error("Erro ao buscar base:", baseError || "Personagem não encontrado.");
        alert("Não foi possível encontrar o Personagem Base! Crie-o primeiro.");
        return;
    }

    const { id_base, elemento, origem } = baseDataArray[0];
    let imageUrlToSave = null;

    if (isEditing) {
        const { data: existingCard, error: existingCardError } = await supabase.from('cards').select('image_url').eq('id', currentEditCardId).single();
        if (existingCardError) { console.error("Erro ao buscar URL da imagem existente:", existingCardError); alert("Erro ao verificar imagem existente da carta."); return; }
        existingImageUrl = existingCard ? existingCard.image_url : null;
    }

    // 2. Lógica de Upload da imagem (CORRIGIDA)
    if (file) {
        const compressed = await compressImage(file);
        
        const safeRarity = slugify(rarity); 
        
        const uniqueFileName = `${id_base}_${safeRarity}_${Date.now()}.jpeg`;
        const folderName = slugify(origem);
        const filePath = `${folderName}/${uniqueFileName}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, compressed, { cacheControl: '3600', upsert: false });

        if (uploadError) { 
            console.error("Erro no upload da imagem:", uploadError); 
            alert(`Erro ao enviar a imagem: ${uploadError.message}. Verifique o nome da raridade e a origem!`); 
            return; 
        }

        const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
        imageUrlToSave = publicUrlData.publicUrl;
    } else {
        imageUrlToSave = existingImageUrl;
    }
    
    // 3. Monta e Salva
    const cardData = { name, rarity, element: elemento, power, id_base: id_base, image_url: imageUrlToSave };
    let dbError;

    if (isEditing) {
        const { error: updateError } = await supabase.from("cards").update(cardData).eq('id', currentEditCardId);
        dbError = updateError;
    } else {
        const { error: insertError } = await supabase.from("cards").insert([cardData]);
        dbError = insertError;
    }

    if (dbError) { console.error("Erro ao salvar/atualizar no banco:", dbError); alert("Erro ao salvar/atualizar no banco! (Verifique RLS e colunas)"); return; }

    alert(`Carta ${isEditing ? 'atualizada' : 'salva'} com sucesso!`);
    resetFormState();
    document.getElementById("cancelEditBtn").style.display = 'none'; 
    await loadUnifiedView();
}

async function saveBasePersonagem() {
    const personagem = document.getElementById("basePersonagem").value.trim();
    const origem = document.getElementById("baseOrigem").value.trim();
    const elemento = document.getElementById("baseElemento").value;
    const isEditingBase = currentEditBaseCharacterId !== null;

    if (!personagem || !origem || !elemento) { alert("Preencha todos os campos do formulário Base!"); return; }

    let dbError;
    const dataToSave = { personagem, origem, elemento };

    if (isEditingBase) {
        const { error: updateError } = await supabase.from("personagens_base").update(dataToSave).eq('id_base', currentEditBaseCharacterId);
        dbError = updateError;
    } else {
        const { error: insertError } = await supabase.from("personagens_base").insert([dataToSave]);
        dbError = insertError;
    }

    if (dbError) { console.error("Erro ao salvar Base:", dbError); alert(`Erro ao salvar no banco (Base): ${dbError.message}`); return; }

    alert(`Personagem Base "${personagem}" ${isEditingBase ? 'atualizado' : 'salvo'} com sucesso!`);
    resetBaseFormState();
    await loadUnifiedView();
}

async function loadUnifiedView() {
    const listContainer = document.getElementById("unifiedListContainer");
    listContainer.innerHTML = "Carregando dados unificados...";

    if (Object.keys(EVOLUTION_COSTS).length === 0) { await loadEvolutionCosts(); }

    const { data: baseData, error } = await supabase
        .from("personagens_base")
        .select(`id_base, personagem, origem, elemento, cards (id, name, rarity, power, image_url)`)
        .order("origem", { ascending: true })
        .order("personagem", { ascending: true });

    if (error) { console.error("Erro ao carregar dados unificados:", error); listContainer.innerHTML = "Erro ao carregar os dados de evolução."; return; }
    if (!baseData || baseData.length === 0) { listContainer.innerHTML = "Nenhum Personagem Base cadastrado."; return; }

    updateNameDatalist(baseData); 
    
    const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];
    let outputHTML = '';
    const groupedByOrigin = baseData.reduce((acc, base) => { (acc[base.origem] = acc[base.origem] || []).push(base); return acc; }, {});

    for (const [origem, personagensArray] of Object.entries(groupedByOrigin)) {
        outputHTML += `<h3 class="group-title">${origem}</h3>`;
        
        personagensArray.forEach(base => {
            const baseElementStyles = getElementStyles(base.elemento);
            outputHTML += `<div class="personagem-base-container">`;
            
            outputHTML += `<h4 class="sub-title" style="border-left-color: ${baseElementStyles.primary};">
                ${base.personagem}
                <span class="base-details">(ID: ${base.id_base} | Elemento: ${base.elemento})</span>
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
                            <div class="evolution-cost">Próxima Evolução: ${custoTexto}</div>
                        </div>
                    `;
                });
            }
            outputHTML += `</div></div>`;
        });
    }

    listContainer.innerHTML = outputHTML;
    
    document.querySelectorAll('.delete-btn').forEach(button => { button.addEventListener('click', handleDelete); });
    document.querySelectorAll('.edit-btn').forEach(button => { button.addEventListener('click', handleEdit); });
    document.querySelectorAll('.edit-base-btn').forEach(button => { button.addEventListener('click', handleEditBaseCharacter); });
    document.querySelectorAll('.delete-base-btn').forEach(button => { button.addEventListener('click', handleDeleteBaseCharacter); });
}

async function handleDelete(event) {
    const cardId = event.currentTarget.dataset.id;
    const cardName = event.currentTarget.dataset.name;
    if (confirm(`Tem certeza que deseja DELETAR a carta ${cardName}? Isso é irreversível.`)) {
        const { error } = await supabase.from('cards').delete().eq('id', cardId);
        if (error) { console.error("Erro ao deletar carta:", error); alert("Erro ao deletar carta. Verifique as permissões de RLS."); } 
        else { alert(`Carta ${cardName} deletada com sucesso!`); await loadUnifiedView(); }
    }
}

async function loadEvolutionCosts() {
    const { data, error } = await supabase.from('regras_raridade').select('raridade_nome, repetidas_para_evoluir');
    if (error) { console.error("Erro ao carregar custos de evolução:", error); return; }
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
    const { data: baseData, error } = await supabase.from('personagens_base').select('*').eq('id_base', baseId).single();
    if (error || !baseData) { console.error("Erro ao buscar Personagem Base para edição:", error); alert("Erro ao carregar dados do Personagem Base."); return; }
    document.getElementById("basePersonagem").value = baseData.personagem;
    document.getElementById("baseOrigem").value = baseData.origem;
    document.getElementById("baseElemento").value = baseData.elemento;
    document.getElementById("saveBaseBtn").textContent = "Atualizar Personagem Base";
    document.getElementById("baseFormContainer").classList.add("editing-mode");
    document.getElementById('baseFormContainer').scrollIntoView({ behavior: 'smooth' });
}

function resetFormState() {
    currentEditCardId = null;
    document.getElementById("cardForm").reset();
    document.getElementById("saveCardBtn").textContent = "Salvar Carta";
    document.getElementById("cardForm").classList.remove("editing-mode", "card-form-fixed");
    document.getElementById("cardPreviewContainer").innerHTML = "";
    document.getElementById("cancelEditBtn").style.display = 'none'; 
}

async function handleDeleteBaseCharacter(event) {
    const baseId = event.currentTarget.dataset.id;
    const baseName = event.currentTarget.dataset.name;

    if (!confirm(`Tem certeza que deseja DELETAR o Personagem Base "${baseName}"? Isso deletará TODAS as cartas ligadas a ele e é irreversível.`)) return;

    const { data: cards, error: cardsError } = await supabase.from('cards').select('id').eq('id_base', baseId);
    if (cardsError) { console.error("Erro ao verificar cartas ligadas:", cardsError); alert("Erro ao verificar cartas ligadas."); return; }

    if (cards.length > 0) {
        if (!confirm(`Existem ${cards.length} cartas ligadas a "${baseName}". Deletar o Personagem Base também DELETARÁ TODAS essas cartas. Continuar?`)) return;
        const { error: deleteCardsError } = await supabase.from('cards').delete().eq('id_base', baseId);
        if (deleteCardsError) { console.error("Erro ao deletar cartas ligadas:", deleteCardsError); alert("Erro ao deletar cartas ligadas."); return; }
    }

    const { error: deleteBaseError } = await supabase.from('personagens_base').delete().eq('id_base', baseId);

    if (deleteBaseError) { console.error("Erro ao deletar Personagem Base:", deleteBaseError); alert("Erro ao deletar Personagem Base."); } 
    else { alert(`Personagem Base "${baseName}" e suas cartas ligadas deletados com sucesso!`); await loadUnifiedView(); }
}


/* === GESTÃO DE REGRAS DE RARIDADE (CRUD COMPLETO) === */

async function loadRarityRules() {
    const listContainer = document.getElementById("rarityRulesContainer");
    if (!listContainer) return;
    listContainer.innerHTML = "Carregando Regras de Raridade...";

    const { data: rules, error } = await supabase
        .from("regras_raridade")
        .select('*')
        .order("ordem_evolucao", { ascending: true });

    if (error) { console.error("Erro ao carregar regras de raridade:", error); listContainer.innerHTML = "Erro ao carregar regras de raridade."; return; }

    let html = '<table><thead><tr><th>Raridade</th><th>Repetidas p/ Evoluir</th><th>Ordem</th><th>Ações</th></tr></thead><tbody>';
    
    rules.forEach(rule => {
        const primaryColor = getRarityColors(rule.raridade_nome).primary;
        html += `
            <tr data-rarity="${rule.raridade_nome}">
                <td style="color: ${primaryColor}; font-weight: bold;">${rule.raridade_nome}</td>
                <td>${rule.repetidas_para_evoluir}</td>
                <td>${rule.ordem_evolucao}</td>
                <td>
                    <button class="edit-rarity-btn" data-name="${rule.raridade_nome}"><i class="fas fa-edit"></i></button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    listContainer.innerHTML = html;
    
    document.querySelectorAll('.edit-rarity-btn').forEach(button => {
        button.addEventListener('click', handleEditRarity); 
    });
    
    // CORRIGIDO O ID do elemento que deve ser ocultado inicialmente
    const formSection = document.getElementById('rarityRulesFormSection');
    if (formSection) {
        formSection.style.display = 'none';
    }
}

async function handleEditRarity(event) {
    const name = event.currentTarget.dataset.name;
    currentEditRarityName = name;
    
    const { data: rule, error } = await supabase
        .from('regras_raridade')
        .select('*')
        .eq('raridade_nome', name)
        .single();
        
    if (error || !rule) { alert("Erro ao carregar regra de raridade."); return; }
    
    document.getElementById('rarityNameInput').value = rule.raridade_nome;
    document.getElementById('evolutionCostInput').value = rule.repetidas_para_evoluir;
    document.getElementById('orderInput').value = rule.ordem_evolucao;
    document.getElementById('rarityNameInput').disabled = true; 
    document.getElementById('saveRarityBtn').textContent = `Atualizar ${name}`;
    
    // CORRIGIDO O ID do elemento que deve ser exibido
    const formSection = document.getElementById('rarityRulesFormSection');
    if (formSection) {
        formSection.style.display = 'block'; 
        formSection.scrollIntoView({ behavior: 'smooth' });
    }
}

async function saveRarityRule() {
    const nome = document.getElementById('rarityNameInput').value;
    const custo = parseInt(document.getElementById('evolutionCostInput').value);
    const ordem = parseInt(document.getElementById('orderInput').value);

    if (!nome || isNaN(custo) || isNaN(ordem)) { alert("Preencha todos os campos corretamente!"); return; }

    const dataToSave = { repetidas_para_evoluir: custo, ordem_evolucao: ordem };

    let dbError;
    
    if (currentEditRarityName) {
        const { error } = await supabase.from("regras_raridade").update(dataToSave).eq('raridade_nome', currentEditRarityName);
        dbError = error;
    } else {
         alert("Erro: O formulário deve ser usado apenas para EDITAR raridades existentes. Use o botão 'Editar' na tabela.");
         return;
    }

    if (dbError) { console.error("Erro ao salvar regra:", dbError); alert(`Erro ao salvar no banco: ${dbError.message}`); return; }

    alert(`Regra de raridade "${nome}" atualizada com sucesso!`);
    currentEditRarityName = null;
    document.getElementById('rarityForm').reset();
    document.getElementById('rarityNameInput').disabled = false;
    document.getElementById('saveRarityBtn').textContent = `Salvar Regra (Apenas Edição)`;
    
    // Esconde o formulário após salvar
    const formSection = document.getElementById('rarityRulesFormSection');
    if (formSection) {
        formSection.style.display = 'none'; 
    }
    
    await loadEvolutionCosts();
    await loadRarityRules();
    await loadUnifiedView(); // GARANTE ATUALIZAÇÃO DAS CARTAS
}


/* === GESTÃO DE PACOTES (CRUD COMPLETO) === */

async function loadPacks() {
    const listContainer = document.getElementById("packsContainer");
    if (!listContainer) return;
    listContainer.innerHTML = "Carregando Pacotes...";

    const { data: packs, error } = await supabase.from("pacotes").select('*').order("preco_moedas", { ascending: true });

    if (error) { console.error("Erro ao carregar pacotes:", error); listContainer.innerHTML = "Erro ao carregar pacotes."; return; }

    let html = '<table><thead><tr><th>Nome</th><th>Preço</th><th>Total Cartas</th><th>Chances (%)</th><th>Ações</th></tr></thead><tbody>';
    
    packs.forEach(pack => {
        const chances = [
            `C: ${(pack.chance_comum * 100).toFixed(1)}%`,
            `R: ${(pack.chance_rara * 100).toFixed(1)}%`,
            `E: ${(pack.chance_epica * 100).toFixed(1)}%`,
            `L: ${(pack.chance_lendaria * 100).toFixed(1)}%`,
            `M: ${(pack.chance_mitica * 100).toFixed(1)}%`
        ].join('<br>');

        html += `
            <tr data-id="${pack.id}">
                <td>${pack.nome}</td>
                <td>${pack.preco_moedas} moedas</td>
                <td>${pack.cartas_total}</td>
                <td>${chances}</td>
                <td>
                    <button class="edit-pack-btn" data-id="${pack.id}"><i class="fas fa-edit"></i></button>
                    <button class="delete-pack-btn" data-id="${pack.id}" data-name="${pack.nome}"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    listContainer.innerHTML = html;
    
    document.querySelectorAll('.edit-pack-btn').forEach(button => { button.addEventListener('click', handleEditPack); });
    document.querySelectorAll('.delete-pack-btn').forEach(button => { button.addEventListener('click', handleDeletePack); });
    
    document.getElementById('newPackBtn').addEventListener('click', resetPackForm); 
    
    // CORRIGIDO O ID do elemento que deve ser ocultado inicialmente
    const formSection = document.getElementById('packFormContainer');
    if (formSection) {
        formSection.style.display = 'none';
    }
}

function resetPackForm() {
    currentEditPackId = null;
    document.getElementById('packForm').reset();
    document.getElementById('savePackBtn').textContent = 'Salvar Novo Pacote';
    document.getElementById('packIdInput').value = ''; 
    
    // CORRIGIDO: Exibe o formulário
    const formSection = document.getElementById('packFormContainer');
    if (formSection) {
        formSection.style.display = 'block'; 
        formSection.scrollIntoView({ behavior: 'smooth' });
    }
}

async function handleEditPack(event) {
    const id = event.currentTarget.dataset.id;
    currentEditPackId = id;
    
    const { data: pack, error } = await supabase.from('pacotes').select('*').eq('id', id).single();
    if (error || !pack) { alert("Erro ao carregar dados do pacote."); return; }

    document.getElementById('packIdInput').value = pack.id;
    document.getElementById('packNameInput').value = pack.nome;
    document.getElementById('packPriceInput').value = pack.preco_moedas;
    document.getElementById('packTotalCardsInput').value = pack.cartas_total;
    
    document.getElementById('chanceComumInput').value = (pack.chance_comum * 100).toFixed(1);
    document.getElementById('chanceRaraInput').value = (pack.chance_rara * 100).toFixed(1);
    document.getElementById('chanceEpicaInput').value = (pack.chance_epica * 100).toFixed(1);
    document.getElementById('chanceLendariaInput').value = (pack.chance_lendaria * 100).toFixed(1);
    document.getElementById('chanceMiticaInput').value = (pack.chance_mitica * 100).toFixed(1);

    document.getElementById('savePackBtn').textContent = `Atualizar Pacote ${pack.nome}`;
    
    // CORRIGIDO: Exibe o formulário
    const formSection = document.getElementById('packFormContainer');
    if (formSection) {
        formSection.style.display = 'block'; 
        formSection.scrollIntoView({ behavior: 'smooth' });
    }
}

async function saveOrUpdatePack() {
    const id = document.getElementById('packIdInput').value;
    const nome = document.getElementById('packNameInput').value.trim();
    const preco = parseInt(document.getElementById('packPriceInput').value);
    const totalCartas = parseInt(document.getElementById('packTotalCardsInput').value);
    
    const chanceComum = parseFloat(document.getElementById('chanceComumInput').value) / 100;
    const chanceRara = parseFloat(document.getElementById('chanceRaraInput').value) / 100;
    const chanceEpica = parseFloat(document.getElementById('chanceEpicaInput').value) / 100;
    const chanceLendaria = parseFloat(document.getElementById('chanceLendariaInput').value) / 100;
    const chanceMitica = parseFloat(document.getElementById('chanceMiticaInput').value) / 100;

    if (!nome || isNaN(preco) || isNaN(totalCartas) || isNaN(chanceComum)) {
        alert("Preencha todos os campos do Pacote corretamente!");
        return;
    }
    
    const totalChance = chanceComum + chanceRara + chanceEpica + chanceLendaria + chanceMitica;
    if (Math.abs(totalChance - 1.00) > 0.001) { 
        alert(`A soma das chances deve ser 100%! Sua soma atual é ${(totalChance * 100).toFixed(2)}%. Ajuste os valores.`);
        return;
    }

    const packData = {
        nome, preco_moedas: preco, cartas_total: totalCartas,
        chance_comum: chanceComum, chance_rara: chanceRara, chance_epica: chanceEpica,
        chance_lendaria: chanceLendaria, chance_mitica: chanceMitica
    };

    let dbError;
    const isEditing = currentEditPackId !== null;

    if (isEditing) {
        const { error } = await supabase.from("pacotes").update(packData).eq('id', id);
        dbError = error;
    } else {
        const { error } = await supabase.from("pacotes").insert([packData]);
        dbError = error;
    }

    if (dbError) { console.error("Erro ao salvar Pacote:", dbError); alert(`Erro ao salvar no banco: ${dbError.message}`); return; }

    alert(`Pacote "${nome}" ${isEditing ? 'atualizado' : 'criado'} com sucesso!`);
    
    // Esconde o formulário após salvar
    const formSection = document.getElementById('packFormContainer');
    if (formSection) {
        formSection.style.display = 'none';
    }
    
    resetPackForm();
    await loadPacks();
}

async function handleDeletePack(event) {
    const id = event.currentTarget.dataset.id;
    const name = event.currentTarget.dataset.name;
    if (!confirm(`Tem certeza que deseja DELETAR o Pacote "${name}"? Isso é irreversível.`)) return;
    
    const { error } = await supabase.from('pacotes').delete().eq('id', id);
    if (error) { console.error("Erro ao deletar pacote:", error); alert("Erro ao deletar pacote."); } 
    else { alert(`Pacote "${name}" deletado com sucesso!`); await loadPacks(); }
}


/* === GESTÃO DE JOGADORES (CRUD Edição de Moedas/Nível) === */

async function loadPlayers() {
    const listContainer = document.getElementById("playersContainer");
    if (!listContainer) return;
    listContainer.innerHTML = "Carregando Jogadores...";

    const { data: players, error } = await supabase
        .from("jogadores")
        .select('id, nome, email, nivel, moedas, total_cartas, data_criacao')
        .order("data_criacao", { ascending: false });

    if (error) { 
        console.error("Erro ao carregar jogadores:", error); 
        listContainer.innerHTML = "Erro ao carregar jogadores. Verifique RLS ou conexão."; 
        return; 
    }

    if (players.length === 0) {
        listContainer.innerHTML = "Nenhum jogador cadastrado.";
        return;
    }
    
    const formSection = document.getElementById('playerEditFormSection');
    if (formSection) {
        formSection.style.display = 'none';
    }

    let html = '<table><thead><tr><th>Nome</th><th>Email</th><th>Nível</th><th>Moedas</th><th>Cartas</th><th>Registro</th><th>Ações</th></tr></thead><tbody>';
    
    players.forEach(player => {
        const formattedDate = new Date(player.data_criacao).toLocaleDateString();
        html += `
            <tr data-id="${player.id}">
                <td>${player.nome}</td>
                <td>${player.email}</td>
                <td>${player.nivel}</td>
                <td>${player.moedas}</td>
                <td>${player.total_cartas}</td>
                <td>${formattedDate}</td>
                <td>
                    <button class="edit-player-btn" data-id="${player.id}"><i class="fas fa-edit"></i></button>
                    <button class="delete-player-btn" data-id="${player.id}" data-name="${player.nome}"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    listContainer.innerHTML = html;
    
    document.querySelectorAll('.edit-player-btn').forEach(button => { button.addEventListener('click', handleEditPlayer); });
    document.querySelectorAll('.delete-player-btn').forEach(button => { button.addEventListener('click', handleDeletePlayer); });
}

async function handleEditPlayer(event) {
    const id = event.currentTarget.dataset.id;
    
    const { data: player, error } = await supabase.from('jogadores').select('*').eq('id', id).single();
    if (error || !player) { alert("Erro ao carregar dados do jogador."); return; }

    document.getElementById('playerEditId').value = player.id;
    document.getElementById('playerEditName').value = player.nome;
    document.getElementById('playerEditEmail').value = player.email;
    document.getElementById('playerEditMoedas').value = player.moedas;
    document.getElementById('playerEditNivel').value = player.nivel;

    const formSection = document.getElementById('playerEditFormSection');
    if (formSection) {
        formSection.style.display = 'block';
        formSection.scrollIntoView({ behavior: 'smooth' });
    }
}

async function savePlayerEdit() {
    const id = document.getElementById('playerEditId').value;
    const moedas = parseInt(document.getElementById('playerEditMoedas').value);
    const nivel = parseInt(document.getElementById('playerEditNivel').value);
    const nome = document.getElementById('playerEditName').value;

    if (!id || isNaN(moedas) || isNaN(nivel)) {
        alert("Dados inválidos para edição de jogador.");
        return;
    }

    const { error } = await supabase.from('jogadores')
        .update({ moedas, nivel })
        .eq('id', id);

    if (error) {
        console.error("Erro ao atualizar jogador:", error);
        alert(`Erro ao atualizar jogador "${nome}": ${error.message}`);
    } else {
        alert(`Jogador "${nome}" atualizado com sucesso!`);
        
        const formSection = document.getElementById('playerEditFormSection');
        if (formSection) {
            formSection.style.display = 'none';
        }
        await loadPlayers();
    }
}

async function handleDeletePlayer(event) {
    const id = event.currentTarget.dataset.id;
    const name = event.currentTarget.dataset.name;

    if (!confirm(`ATENÇÃO! Tem certeza que deseja DELETAR o jogador "${name}"? Isso é irreversível. Certifique-se de que a exclusão em cascata (CASCADE DELETE) está ativada nas tabelas 'cartas_do_jogador' e 'trocas'.`)) return;

    const { error } = await supabase.from('jogadores').delete().eq('id', id);

    if (error) {
        console.error("Erro ao deletar jogador:", error);
        alert(`Erro ao deletar jogador "${name}". Verifique restrições de chaves estrangeiras (RLS/Foreign Keys).`);
    } else {
        alert(`Jogador "${name}" deletado com sucesso!`);
        await loadPlayers();
    }
}


// === LISTENERS E INICIALIZAÇÃO ===

document.getElementById("fileInput").addEventListener("change", previewCard);
document.getElementById("cardName").addEventListener("input", previewCard);
document.getElementById("cardPower").addEventListener("input", previewCard);
document.getElementById("cardRarity").addEventListener("change", previewCard);

document.getElementById("saveCardBtn").addEventListener("click", saveOrUpdateCard);
document.getElementById("saveBaseBtn").addEventListener("click", saveBasePersonagem);
document.getElementById("cancelEditBtn").addEventListener("click", cancelEditCard); 

document.getElementById("saveRarityBtn").addEventListener("click", saveRarityRule);

document.getElementById("savePackBtn").addEventListener("click", saveOrUpdatePack);
document.getElementById("newPackBtn").addEventListener("click", resetPackForm); 

document.getElementById("savePlayerEditBtn").addEventListener("click", savePlayerEdit); 

document.addEventListener("DOMContentLoaded", async () => {
    await loadEvolutionCosts(); 
    loadUnifiedView(); 
    loadRarityRules();
    loadPacks();
    loadPlayers();
});
