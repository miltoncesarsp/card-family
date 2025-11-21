let EVOLUTION_COSTS = {}; 
const BUCKET_NAME = 'cards'; 
let currentEditCardId = null; 
let currentEditBaseCharacterId = null; 
let currentEditRarityName = null; 
let currentEditPackId = null; 
let currentEditPlayerId = null;

// --- 1. VERIFICAÇÃO DE SEGURANÇA (NOVO) ---
document.addEventListener("DOMContentLoaded", async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert("⚠️ Acesso restrito! Você será redirecionado para fazer login.");
        window.location.href = "index.html"; // Manda pro jogo para logar
        return;
    }
    
    // Se logado, carrega o resto
    await loadEvolutionCosts(); 
    loadUnifiedView(); 
    loadRarityRules(); 
    loadPacks(); 
    loadPlayers();
});

// FUNÇÕES AUXILIARES
function slugify(text) {
    return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
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

function updateNameDatalist(baseCharacters) {
    const datalist = document.getElementById('personagem-nomes');
    if (!datalist) return;
    datalist.innerHTML = baseCharacters.map(base => `<option value="${base.personagem}">`).join('');
}


/* === FUNÇÕES DE CARTAS E PERSONAGEM BASE === */

async function handleEdit(event) {
    const cardId = event.currentTarget.dataset.id;
    currentEditCardId = cardId;
    const { data: cardData, error } = await supabase.from('cards').select('*').eq('id', cardId).single();
    if (error || !cardData) { console.error(error); alert("Erro ao carregar carta."); return; }
    
    document.getElementById("cardName").value = cardData.name;
    document.getElementById("cardPower").value = cardData.power;
    document.getElementById("cardRarity").value = cardData.rarity;
    document.getElementById("saveCardBtn").textContent = "Atualizar Carta";
    document.getElementById("cardForm").classList.add("editing-mode", "card-form-fixed");
    document.getElementById("cancelEditBtn").style.display = 'inline-block';
    
    previewCard(cardData.image_url);
    window.scrollTo(0,0);
}

function cancelEditCard() {
    resetFormState();
}

function previewCard(imageUrl = null) {
    const name = document.getElementById("cardName").value.trim();
    const power = document.getElementById("cardPower").value;
    const rarity = document.getElementById("cardRarity").value;
    const element = "Terra"; // Padrão para preview
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];
    const container = document.getElementById("cardPreviewContainer");
    
    container.innerHTML = "";
    if (!name && !power && !file && !imageUrl) return;
    
    const div = document.createElement("div");
    div.className = "card-preview"; // Usa a classe GRANDE do CSS
    
    const rarityStyles = getRarityColors(rarity);
    const elementStyles = getElementStyles(element);

    if (file) {
        div.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
    } else if (imageUrl) {
        div.style.backgroundImage = `url(${imageUrl})`;
    }

    // Estrutura HTML limpa (sem wrappers desnecessários) para bater com o novo CSS
div.innerHTML = `
        <div class="card-element-badge" style="background: ${elementStyles.background};">
            ${getElementIcon(element)}
        </div>

        <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: ${rarityTextColor};">${rarity}</div>
        
        <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${power}</div>
        
        <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${name}</div>
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
        .from("personagens_base").select("id_base, origem, elemento").ilike("personagem", name).limit(1);

    if (baseError || baseDataArray.length === 0) {
        alert("Personagem Base não encontrado! Crie-o primeiro.");
        return;
    }

    const { id_base, elemento, origem } = baseDataArray[0];
    let imageUrlToSave = null;

    if (isEditing) {
        const { data: existingCard } = await supabase.from('cards').select('image_url').eq('id', currentEditCardId).single();
        existingImageUrl = existingCard ? existingCard.image_url : null;
    }

    if (file) {
        const compressed = await compressImage(file);
        const safeRarity = slugify(rarity); 
        const uniqueFileName = `${id_base}_${safeRarity}_${Date.now()}.jpeg`;
        const filePath = `${slugify(origem)}/${uniqueFileName}`;

        const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, compressed, { upsert: true });
        if (uploadError) { alert(`Erro upload: ${uploadError.message}`); return; }

        const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
        imageUrlToSave = publicUrlData.publicUrl;
    } else {
        imageUrlToSave = existingImageUrl;
    }
    
    const cardData = { name, rarity, element: elemento, power, id_base: id_base, image_url: imageUrlToSave };
    let dbError;

    if (isEditing) {
        const { error } = await supabase.from("cards").update(cardData).eq('id', currentEditCardId);
        dbError = error;
    } else {
        const { error } = await supabase.from("cards").insert([cardData]);
        dbError = error;
    }

    if (dbError) { console.error(dbError); alert(`Erro ao salvar: ${dbError.message}`); return; }

    alert(`Carta ${isEditing ? 'atualizada' : 'salva'} com sucesso!`);
    resetFormState();
    await loadUnifiedView();
}

async function saveBasePersonagem() {
    const personagem = document.getElementById("basePersonagem").value.trim();
    const origem = document.getElementById("baseOrigem").value.trim();
    const elemento = document.getElementById("baseElemento").value;
    const isEditingBase = currentEditBaseCharacterId !== null;

    if (!personagem || !origem || !elemento) { alert("Preencha todos os campos!"); return; }

    const dataToSave = { personagem, origem, elemento };
    let dbError;

    if (isEditingBase) {
        const { error } = await supabase.from("personagens_base").update(dataToSave).eq('id_base', currentEditBaseCharacterId);
        dbError = error;
    } else {
        const { error } = await supabase.from("personagens_base").insert([dataToSave]);
        dbError = error;
    }

    if (dbError) { alert(`Erro ao salvar Base: ${dbError.message}`); return; }

    alert(`Personagem Base salvo!`);
    resetBaseFormState();
    await loadUnifiedView();
}

async function loadUnifiedView() {
    const listContainer = document.getElementById("unifiedListContainer");
    listContainer.innerHTML = "Carregando...";

    if (Object.keys(EVOLUTION_COSTS).length === 0) { await loadEvolutionCosts(); }

    const { data: baseData, error } = await supabase
        .from("personagens_base")
        .select(`id_base, personagem, origem, elemento, cards (id, name, rarity, power, image_url)`)
        .order("origem", { ascending: true })
        .order("personagem", { ascending: true });

    if (error) { listContainer.innerHTML = "Erro ao carregar."; return; }
    if (!baseData || baseData.length === 0) { listContainer.innerHTML = "Nenhum cadastro."; return; }

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
                <span class="base-details">(ID: ${base.id_base} | ${base.elemento})</span>
                <div class="base-management-buttons">
                    <button class="edit-base-btn" data-id="${base.id_base}"><i class="fas fa-edit"></i></button>
                    <button class="delete-base-btn" data-id="${base.id_base}" data-name="${base.personagem}"><i class="fas fa-trash-alt"></i></button>
                </div>
            </h4>`;
            
            outputHTML += `<div class="card-group-container card-evolution-line">`;
            base.cards.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));

            if (base.cards.length === 0) {
                outputHTML += `<p class="base-details" style="margin-left: 10px;">Sem cartas.</p>`;
            } else {
                base.cards.forEach(card => { 
                    const rarityStyles = getRarityColors(card.rarity);
                    const custo = EVOLUTION_COSTS[card.rarity];
                    const custoTexto = (card.rarity === 'Mítica' || !custo) ? "Máx" : `${custo}x`;
                    
                    // --- COPIE E COLE ESTE BLOCO INTEIRO ---
                    outputHTML += `
                        <div class="card-preview card-small card-editable" 
                            data-card-id="${card.id}" 
                            data-card-name="${card.name}"
                            style="background-image: url('${card.image_url}'); border-color: ${rarityStyles.primary};" 
                        >
                            <div class="card-management-buttons">
                                <button class="edit-btn" data-id="${card.id}"><i class="fas fa-edit"></i></button>
                                <button class="delete-btn" data-id="${card.id}" data-name="${card.name}"><i class="fas fa-trash-alt"></i></button>
                            </div>
                            
                            <div class="card-element-badge" style="background: ${baseElementStyles.background};">
                                ${getElementIcon(base.elemento)}
                            </div>

                            <div class="rarity-badge" style="background-color: ${rarityStyles.primary};">${card.rarity.substring(0,1)}</div>
                            
                            <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${card.power}</div>
                            
                            <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
                            
                            <div class="evolution-cost">Evolui: ${custoTexto}</div>
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
    if (confirm(`Deletar carta ${cardName}?`)) {
        const { error } = await supabase.from('cards').delete().eq('id', cardId);
        if (error) alert("Erro ao deletar. Verifique permissões.");
        else { await loadUnifiedView(); }
    }
}

async function loadEvolutionCosts() {
    const { data } = await supabase.from('regras_raridade').select('raridade_nome, repetidas_para_evoluir');
    if (data) {
        EVOLUTION_COSTS = data.reduce((acc, rule) => {
            acc[rule.raridade_nome] = rule.repetidas_para_evoluir;
            return acc;
        }, {});
    }
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
    const { data: baseData } = await supabase.from('personagens_base').select('*').eq('id_base', baseId).single();
    if (baseData) {
        document.getElementById("basePersonagem").value = baseData.personagem;
        document.getElementById("baseOrigem").value = baseData.origem;
        document.getElementById("baseElemento").value = baseData.elemento;
        document.getElementById("saveBaseBtn").textContent = "Atualizar Personagem Base";
        document.getElementById("baseFormContainer").classList.add("editing-mode");
        document.getElementById('baseFormContainer').scrollIntoView({ behavior: 'smooth' });
    }
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
    if (confirm(`Deletar Personagem Base "${baseName}" e TODAS as suas cartas?`)) {
        const { error } = await supabase.from('personagens_base').delete().eq('id_base', baseId);
        if (error) alert("Erro ao deletar.");
        else { await loadUnifiedView(); }
    }
}

/* === GESTÃO DE REGRAS DE RARIDADE === */
async function loadRarityRules() {
    const listContainer = document.getElementById("rarityRulesContainer");
    if (!listContainer) return;
    const { data: rules } = await supabase.from("regras_raridade").select('*').order("ordem_evolucao", { ascending: true });
    if (!rules) return;

    let html = '<table><thead><tr><th>Raridade</th><th>Custo Evolução</th><th>Ordem</th><th>Ações</th></tr></thead><tbody>';
    rules.forEach(rule => {
        const primaryColor = getRarityColors(rule.raridade_nome).primary;
        html += `<tr data-rarity="${rule.raridade_nome}">
                <td style="color: ${primaryColor}; font-weight: bold;">${rule.raridade_nome}</td>
                <td>${rule.repetidas_para_evoluir}</td>
                <td>${rule.ordem_evolucao}</td>
                <td><button class="edit-rarity-btn" data-name="${rule.raridade_nome}"><i class="fas fa-edit"></i></button></td>
            </tr>`;
    });
    html += '</tbody></table>';
    listContainer.innerHTML = html;
    document.querySelectorAll('.edit-rarity-btn').forEach(button => { button.addEventListener('click', handleEditRarity); });
    document.getElementById('rarityRulesFormSection').style.display = 'none';
}

async function handleEditRarity(event) {
    const name = event.currentTarget.dataset.name;
    currentEditRarityName = name;
    const { data: rule } = await supabase.from('regras_raridade').select('*').eq('raridade_nome', name).single();
    if (rule) {
        document.getElementById('rarityNameInput').value = rule.raridade_nome;
        document.getElementById('evolutionCostInput').value = rule.repetidas_para_evoluir;
        document.getElementById('orderInput').value = rule.ordem_evolucao;
        document.getElementById('saveRarityBtn').textContent = `Atualizar ${name}`;
        document.getElementById('rarityRulesFormSection').style.display = 'block';
        document.getElementById('rarityRulesFormSection').scrollIntoView({ behavior: 'smooth' });
    }
}

async function saveRarityRule() {
    const custo = parseInt(document.getElementById('evolutionCostInput').value);
    const ordem = parseInt(document.getElementById('orderInput').value);
    if (currentEditRarityName) {
        await supabase.from("regras_raridade").update({ repetidas_para_evoluir: custo, ordem_evolucao: ordem }).eq('raridade_nome', currentEditRarityName);
        alert("Regra atualizada!");
        document.getElementById('rarityRulesFormSection').style.display = 'none';
        loadRarityRules();
        loadEvolutionCosts();
    }
}

/* === GESTÃO DE PACOTES === */
async function loadPacks() {
    const listContainer = document.getElementById("packsContainer");
    if (!listContainer) return;
    const { data: packs } = await supabase.from("pacotes").select('*').order("preco_moedas", { ascending: true });
    
    let html = '<table><thead><tr><th>Nome</th><th>Preço</th><th>Total</th><th>Chances</th><th>Ações</th></tr></thead><tbody>';
    packs.forEach(pack => {
        html += `<tr>
                <td>${pack.nome}</td>
                <td>${pack.preco_moedas}</td>
                <td>${pack.cartas_total}</td>
                <td>Lendária: ${(pack.chance_lendaria*100).toFixed(0)}%</td>
                <td>
                    <button class="edit-pack-btn" data-id="${pack.id}"><i class="fas fa-edit"></i></button>
                    <button class="delete-pack-btn" data-id="${pack.id}" data-name="${pack.nome}"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>`;
    });
    html += '</tbody></table>';
    listContainer.innerHTML = html;
    document.querySelectorAll('.edit-pack-btn').forEach(button => button.addEventListener('click', handleEditPack));
    document.querySelectorAll('.delete-pack-btn').forEach(button => button.addEventListener('click', handleDeletePack));
    document.getElementById('packFormContainer').style.display = 'none';
}

function resetPackForm() {
    currentEditPackId = null;
    document.getElementById('packForm').reset();
    document.getElementById('savePackBtn').textContent = 'Salvar Novo Pacote';
    document.getElementById('packFormContainer').style.display = 'block';
}

async function handleEditPack(event) {
    const id = event.currentTarget.dataset.id;
    currentEditPackId = id;
    const { data: pack } = await supabase.from('pacotes').select('*').eq('id', id).single();
    
    if(pack) {
        document.getElementById('packNameInput').value = pack.nome;
        document.getElementById('packPriceInput').value = pack.preco_moedas;
        document.getElementById('packTotalCardsInput').value = pack.cartas_total;
        
        // Chances
        document.getElementById('chanceComumInput').value = (pack.chance_comum * 100).toFixed(1);
        document.getElementById('chanceRaraInput').value = (pack.chance_rara * 100).toFixed(1);
        document.getElementById('chanceEpicaInput').value = (pack.chance_epica * 100).toFixed(1);
        document.getElementById('chanceLendariaInput').value = (pack.chance_lendaria * 100).toFixed(1);
        document.getElementById('chanceMiticaInput').value = (pack.chance_mitica * 100).toFixed(1);
        
        // Imagem (Novo)
        document.getElementById('packCurrentImageUrl').value = pack.imagem_url || "";
        
        document.getElementById('savePackBtn').textContent = `Atualizar Pacote ${pack.nome}`;
        document.getElementById('packFormContainer').style.display = 'block';
        document.getElementById('packFormContainer').scrollIntoView({ behavior: 'smooth' });
    }
}

async function saveOrUpdatePack() {
    const nome = document.getElementById('packNameInput').value;
    const preco = parseInt(document.getElementById('packPriceInput').value);
    const total = parseInt(document.getElementById('packTotalCardsInput').value);
    
    // Pegando a imagem
    const fileInput = document.getElementById("packFileInput");
    const file = fileInput.files[0];
    let imageUrlToSave = document.getElementById('packCurrentImageUrl').value; // Mantém a antiga por padrão

    // Lógica de Upload (Se tiver arquivo novo)
    if (file) {
        const compressed = await compressImage(file); // Usa a mesma função de compressão das cartas
        const fileName = `packs/pack_${Date.now()}.jpeg`; // Salva numa pasta "packs" (opcional) ou na raiz
        
        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, compressed, { upsert: true });

        if (uploadError) {
            alert("Erro ao subir imagem do pacote: " + uploadError.message);
            return;
        }

        const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
        imageUrlToSave = publicUrlData.publicUrl;
    }

    const chances = {
        chance_comum: parseFloat(document.getElementById('chanceComumInput').value) / 100,
        chance_rara: parseFloat(document.getElementById('chanceRaraInput').value) / 100,
        chance_epica: parseFloat(document.getElementById('chanceEpicaInput').value) / 100,
        chance_lendaria: parseFloat(document.getElementById('chanceLendariaInput').value) / 100,
        chance_mitica: parseFloat(document.getElementById('chanceMiticaInput').value) / 100
    };

    // Adiciona imagem_url no objeto para salvar
    const packData = { 
        nome, 
        preco_moedas: preco, 
        cartas_total: total, 
        imagem_url: imageUrlToSave, 
        ...chances 
    };
    
    if (currentEditPackId) {
        await supabase.from("pacotes").update(packData).eq('id', currentEditPackId);
    } else {
        await supabase.from("pacotes").insert([packData]);
    }
    
    alert("Pacote salvo com sucesso!");
    loadPacks();
    resetPackForm();
    document.getElementById('packFileInput').value = ""; // Limpa o input
}

async function handleDeletePack(event) {
    const id = event.currentTarget.dataset.id;
    if(confirm("Deletar pacote?")) {
        await supabase.from('pacotes').delete().eq('id', id);
        loadPacks();
    }
}

/* === GESTÃO DE JOGADORES === */
async function loadPlayers() {
    const listContainer = document.getElementById("playersContainer");
    if (!listContainer) return;
    const { data: players } = await supabase.from("jogadores").select('*').order("data_criacao", { ascending: false });
    
    let html = '<table><thead><tr><th>Nome</th><th>Email</th><th>Moedas</th><th>Ações</th></tr></thead><tbody>';
    players.forEach(player => {
        html += `<tr>
                <td>${player.nome}</td>
                <td>${player.email}</td>
                <td>${player.moedas}</td>
                <td><button class="edit-player-btn" data-id="${player.id}"><i class="fas fa-edit"></i></button></td>
            </tr>`;
    });
    html += '</tbody></table>';
    listContainer.innerHTML = html;
    document.querySelectorAll('.edit-player-btn').forEach(button => button.addEventListener('click', handleEditPlayer));
}

async function handleEditPlayer(event) {
    const id = event.currentTarget.dataset.id;
    const { data: player } = await supabase.from('jogadores').select('*').eq('id', id).single();
    if(player) {
        document.getElementById('playerEditId').value = player.id;
        document.getElementById('playerEditName').value = player.nome;
        document.getElementById('playerEditEmail').value = player.email;
        document.getElementById('playerEditMoedas').value = player.moedas;
        document.getElementById('playerEditNivel').value = player.nivel;
        document.getElementById('playerEditFormSection').style.display = 'block';
    }
}

async function savePlayerEdit() {
    const id = document.getElementById('playerEditId').value;
    const moedas = parseInt(document.getElementById('playerEditMoedas').value);
    const nivel = parseInt(document.getElementById('playerEditNivel').value);
    await supabase.from('jogadores').update({ moedas, nivel }).eq('id', id);
    alert("Jogador atualizado!");
    document.getElementById('playerEditFormSection').style.display = 'none';
    loadPlayers();
}

/* === GESTÃO DE CAPAS DE ORIGEM === */

async function loadOriginCovers() {
    const container = document.getElementById('originCoversList');
    if(!container) return;
    container.innerHTML = "Carregando...";
    
    const { data } = await supabase.from('capas_origens').select('*');
    
    if(!data || data.length === 0) {
        container.innerHTML = "<p>Nenhuma capa cadastrada.</p>";
        return;
    }
    
    let html = '';
    data.forEach(item => {
        html += `
            <div style="position: relative; width: 100px; height: 60px; background-image: url('${item.image_url}'); background-size: cover; border-radius: 8px; border: 2px solid #ccc;">
                <div style="position: absolute; bottom: 0; background: rgba(0,0,0,0.7); color: white; width: 100%; font-size: 10px; text-align: center;">${item.origem}</div>
                <button onclick="deleteOriginCover(${item.id})" style="position: absolute; top: -5px; right: -5px; width: 20px; height: 20px; background: red; color: white; border: none; border-radius: 50%; cursor: pointer; padding: 0; font-size: 10px;">X</button>
            </div>
        `;
    });
    container.innerHTML = html;
}

async function saveOriginCover() {
    const origem = document.getElementById('originNameInput').value.trim();
    const fileInput = document.getElementById('originFileInput');
    const file = fileInput.files[0];
    
    if (!origem || !file) { alert("Preencha nome e imagem!"); return; }
    
    // 1. Upload da Imagem
    const compressed = await compressImage(file);
    const fileName = `origins/${slugify(origem)}_${Date.now()}.jpeg`;
    
    const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(fileName, compressed, { upsert: true });
    if (uploadError) { alert("Erro upload: " + uploadError.message); return; }
    
    const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;
    
    // 2. Salvar no Banco (Upsert: Se já existe a origem, atualiza a foto)
    const { error } = await supabase.from('capas_origens').upsert({ origem, image_url: imageUrl }, { onConflict: 'origem' });
    
    if (error) alert("Erro ao salvar: " + error.message);
    else {
        alert("Capa salva com sucesso!");
        loadOriginCovers();
        document.getElementById('originCoverForm').reset();
    }
}

async function deleteOriginCover(id) {
    if(confirm("Deletar essa capa?")) {
        await supabase.from('capas_origens').delete().eq('id', id);
        loadOriginCovers();
    }
}

// --- LISTENERS ---
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
