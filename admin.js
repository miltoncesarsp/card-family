let EVOLUTION_COSTS = {}; 
const BUCKET_NAME = 'cards'; 
let currentEditCardId = null; 
let currentEditBaseCharacterId = null; 
let currentEditRarityName = null; 
let currentEditPackId = null; 
let currentEditPlayerId = null;
let currentEditGameId = null;

// --- 1. VERIFICAÇÃO DE SEGURANÇA (NOVO) ---
document.addEventListener("DOMContentLoaded", async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert("⚠️ Acesso restrito!"); 
        window.location.href = "index.html"; 
        return;
    }
    
    // Carrega apenas o essencial para a primeira aba (Bases/Cartas)
    await loadEvolutionCosts(); 
    loadBasesList(); // Carrega a aba inicial
    loadUnifiedView(); 
    // Os outros (Players, Packs, Origins) carregam ao clicar na aba!

    // Listener da busca
    const searchInput = document.getElementById('adminSearchInput');
    if(searchInput) {
        searchInput.addEventListener('keyup', filterCards);
    }
});

// FUNÇÕES AUXILIARES
function slugify(text) {
    return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/* === UTILITÁRIOS === */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = type === 'success' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-circle"></i>';
    
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    // Remove após 3 segundos
    setTimeout(() => {
        toast.style.animation = 'fadeOutToast 0.5s forwards';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
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

/* === LÓGICA DE BUSCA === */
function filterCards() {
    const term = document.getElementById('adminSearchInput').value.toLowerCase();
    const containers = document.querySelectorAll('.personagem-base-container');
    const titles = document.querySelectorAll('.group-title');

    containers.forEach(container => {
        const text = container.textContent.toLowerCase();
        container.style.display = text.includes(term) ? "" : "none";
    });
}

/* === MODAL DE EDIÇÃO === */
function openEditModal() {
    document.getElementById('editCardModal').classList.remove('hidden');
}

window.closeEditModal = function() {
    document.getElementById('editCardModal').classList.add('hidden');
    currentEditCardId = null;
    document.getElementById('modalCardForm').reset();
    document.getElementById('modalImagePreview').style.backgroundImage = 'none';
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

    // Busca dados frescos do banco
    const { data: cardData, error } = await supabase.from('cards').select('*').eq('id', cardId).single();
    
    if (error || !cardData) { 
        console.error(error); 
        showToast("Erro ao carregar carta.", "error"); 
        return; 
    }
    
    // Popula o MODAL
    document.getElementById("modalCardId").value = cardData.id;
    document.getElementById("modalBaseId").value = cardData.id_base;
    document.getElementById("modalCardName").value = cardData.name;
    document.getElementById("modalCardPower").value = cardData.power;
    document.getElementById("modalCardRarity").value = cardData.rarity;
    
    if(cardData.image_url) {
        document.getElementById('modalImagePreview').style.backgroundImage = `url('${cardData.image_url}')`;
    }

    openEditModal();
}

function cancelEditCard() {
    resetFormState();
}

// 2. Salvar NOVA Carta (Formulário do Topo)
async function saveNewCard() {
    const name = document.getElementById("cardName").value.trim();
    const rarity = document.getElementById("cardRarity").value;
    const power = parseInt(document.getElementById("cardPower").value);
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    if (!name || !rarity || !power || !file) { 
        showToast("Para criar: Nome, Raridade, Força e Imagem são obrigatórios!", "error"); 
        return; 
    }

    const { data: baseDataArray, error: baseError } = await supabase
        .from("personagens_base").select("id_base, origem, elemento").ilike("personagem", name).limit(1);

    if (baseError || baseDataArray.length === 0) {
        showToast("Personagem Base não encontrado! Crie-o primeiro.", "error");
        return;
    }

    const { id_base, elemento, origem } = baseDataArray[0];

    // Upload
    const compressed = await compressImage(file);
    const safeRarity = slugify(rarity); 
    const uniqueFileName = `${id_base}_${safeRarity}_${Date.now()}.jpeg`;
    const filePath = `${slugify(origem)}/${uniqueFileName}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, compressed, { upsert: true });
    if (uploadError) { showToast(`Erro upload: ${uploadError.message}`, "error"); return; }

    const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    
    const cardData = { name, rarity, element: elemento, power, id_base: id_base, image_url: publicUrlData.publicUrl };

    const { error } = await supabase.from("cards").insert([cardData]);

    if (error) { showToast(`Erro ao salvar: ${error.message}`, "error"); return; }

    showToast(`Carta criada com sucesso!`);
    
    // Limpa form de criação
    document.getElementById("cardForm").reset();
    document.getElementById("cardPreviewContainer").innerHTML = "";
    await loadUnifiedView();
}

// 3. Salvar EDIÇÃO (Vindo do Modal)
async function saveCardFromModal() {
    const id = document.getElementById("modalCardId").value;
    const power = parseInt(document.getElementById("modalCardPower").value);
    const rarity = document.getElementById("modalCardRarity").value;
    const fileInput = document.getElementById("modalFileInput");
    const file = fileInput.files[0];
    const name = document.getElementById("modalCardName").value; // Apenas leitura visual, mas usado para log

    if (!id) return;

    let updateData = { power, rarity };

    // Se tiver imagem nova, faz upload
    if (file) {
        // Precisamos da origem para a pasta. Busca rápido do elemento base (poderia otimizar, mas ok)
        const baseId = document.getElementById("modalBaseId").value;
        const { data: baseData } = await supabase.from('personagens_base').select('origem').eq('id_base', baseId).single();
        
        if (baseData) {
            const compressed = await compressImage(file);
            const safeRarity = slugify(rarity);
            const fileName = `${baseId}_${safeRarity}_EDIT_${Date.now()}.jpeg`;
            const filePath = `${slugify(baseData.origem)}/${fileName}`;
            
            const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, compressed);
            
            if (!uploadError) {
                const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
                updateData.image_url = urlData.publicUrl;
            }
        }
    }

    const { error } = await supabase.from("cards").update(updateData).eq('id', id);

    if (error) {
        showToast("Erro ao atualizar: " + error.message, "error");
    } else {
        showToast("Carta atualizada com sucesso!");
        closeEditModal();
        await loadUnifiedView(); // Recarrega a lista para mostrar mudanças
    }
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

        <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">${rarity}</div>
        
        <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${power}</div>
        
        <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${name}</div>
    `;
    container.appendChild(div);
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

/* === CARREGAR CARTAS COM ACORDEÃO (ABA 2) === */
async function loadUnifiedView() {
    const listContainer = document.getElementById("unifiedListContainer");
    listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;"><i class="fas fa-spinner fa-spin"></i> Carregando lista...</div>';

    if (Object.keys(EVOLUTION_COSTS).length === 0) { await loadEvolutionCosts(); }

    // Busca cartas com join na base
    const { data: baseData, error } = await supabase
        .from("personagens_base")
        .select(`id_base, personagem, origem, elemento, cards (id, name, rarity, power, image_url, id_base)`)
        .order("origem", { ascending: true })
        .order("personagem", { ascending: true });

    if (error) { listContainer.innerHTML = "Erro ao carregar."; return; }

    const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];
    const groupedByOrigin = baseData.reduce((acc, base) => { (acc[base.origem] = acc[base.origem] || []).push(base); return acc; }, {});

    let outputHTML = '';

    for (const [origem, personagensArray] of Object.entries(groupedByOrigin)) {
        // Conta total de cartas nessa origem para mostrar no header
        let totalCartasOrigin = 0;
        personagensArray.forEach(p => totalCartasOrigin += p.cards.length);

        // Header do Acordeão
        outputHTML += `
            <div class="origin-accordion">
                <div class="origin-header" onclick="toggleOrigin(this)">
                    <div>
                        <h3 class="origin-title" style="display:inline;">${origem}</h3>
                        <span class="origin-count">${totalCartasOrigin} cartas</span>
                    </div>
                    <i class="fas fa-chevron-down transition-icon"></i>
                </div>
                
                <div class="origin-content"> `;

        // Conteúdo da Origem (Personagens)
        personagensArray.forEach(base => {
            const baseElementStyles = getElementStyles(base.elemento);
            
            // Se o personagem não tem cartas, não mostra nada OU mostra vazio (opcional).
            // Vamos mostrar o nome dele para saber que existe
            outputHTML += `<div class="personagem-base-container" style="margin-bottom:25px;">`;
            
            // Título do Personagem (Sem botões de editar base agora!)
            outputHTML += `<h4 class="sub-title" style="border-left-color: ${baseElementStyles.primary}; margin-bottom:10px;">
                ${base.personagem} <span class="base-details" style="opacity:0.5; font-size:0.8em;">(${base.elemento})</span>
            </h4>`;
            
            outputHTML += `<div class="card-evolution-line">`;
            
            if (base.cards.length === 0) {
                outputHTML += `<p style="color:#555; font-style:italic; font-size:0.9em; padding:10px;">Sem cartas cadastradas.</p>`;
            } else {
                base.cards.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));
                
                base.cards.forEach(card => { 
                    const rarityStyles = getRarityColors(card.rarity);
                    const custo = EVOLUTION_COSTS[card.rarity];
                    const custoTexto = (card.rarity === 'Mítica' || !custo) ? "Máx" : `${custo}x`;
                    
                    // ESTRUTURA NOVA: Wrapper + Botões Embaixo
                    outputHTML += `
                        <div class="card-wrapper">
                            <div class="card-preview card-small" 
                                style="background-image: url('${card.image_url}'); border-color: ${rarityStyles.primary}; cursor:default;">
                                
                                <div class="card-element-badge" style="background: ${baseElementStyles.background};">
                                    ${getElementIcon(base.elemento)}
                                </div>
                                <div class="rarity-badge" style="background-color: ${rarityStyles.primary}; color: white;">${card.rarity.substring(0,1)}</div>
                                <div class="card-force-circle" style="background-color: ${rarityStyles.primary}; color: white; border-color: white;">${card.power}</div>
                                <div class="card-name-footer" style="background-color: ${rarityStyles.primary}">${card.name}</div>
                                <div class="evolution-cost">Evolui: ${custoTexto}</div>
                            </div>

                            <div class="card-actions-footer">
                                <button class="btn-card-edit" onclick="handleEditCardClick('${card.id}')">
                                    <i class="fas fa-edit"></i> Editar
                                </button>
                                <button class="btn-card-delete" onclick="handleDeleteCardClick('${card.id}', '${card.name}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
            outputHTML += `</div></div>`; // Fecha card-line e container
        });

        outputHTML += `</div></div>`; // Fecha origin-content e accordion
    }

    listContainer.innerHTML = outputHTML;
}

async function handleDelete(event) {
    const cardId = event.currentTarget.dataset.id;
    const cardName = event.currentTarget.dataset.name;
    if (confirm(`Deletar carta ${cardName}?`)) {
        const { error } = await supabase.from('cards').delete().eq('id', cardId);
        if (error) showToast("Erro ao deletar.", "error");
        else { 
            showToast("Carta deletada.");
            await loadUnifiedView(); 
        }
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

/* === UTILITÁRIO DE MODAL GENÉRICO === */
function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    // Limpa variáveis globais se necessário
    if(modalId === 'editPackModal') currentEditPackId = null;
    if(modalId === 'editPlayerModal') currentEditPlayerId = null;
    if(modalId === 'editBaseModal') currentEditBaseCharacterId = null;
}
window.closeModal = closeModal; // Exporta para o HTML

/* ==========================================================
   1. BASE CHARACTERS (MODAL)
   ========================================================== */
async function handleEditBaseCharacter(event) {
    const baseId = event.currentTarget.dataset.id;
    currentEditBaseCharacterId = baseId;

    const { data: baseData, error } = await supabase.from('personagens_base').select('*').eq('id_base', baseId).single();
    
    if (error) { showToast("Erro ao carregar base", "error"); return; }

    // Preenche o modal
    document.getElementById('modalBaseId').value = baseData.id_base;
    document.getElementById('modalBasePersonagem').value = baseData.personagem;
    document.getElementById('modalBaseOrigem').value = baseData.origem;
    document.getElementById('modalBaseElemento').value = baseData.elemento;

    // Abre modal
    document.getElementById('editBaseModal').classList.remove('hidden');
}

async function saveBaseFromModal() {
    const id = document.getElementById('modalBaseId').value;
    const personagem = document.getElementById('modalBasePersonagem').value;
    const origem = document.getElementById('modalBaseOrigem').value;
    const elemento = document.getElementById('modalBaseElemento').value;

    const { error } = await supabase.from('personagens_base')
        .update({ personagem, origem, elemento })
        .eq('id_base', id);

    if (error) showToast("Erro: " + error.message, "error");
    else {
        showToast("Personagem Base atualizado!");
        closeModal('editBaseModal');
        loadUnifiedView();
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

/* ==========================================================
   4. REGRAS (MODAL)
   ========================================================== */
async function handleEditRarity(event) {
    const name = event.currentTarget.dataset.name;
    const { data: rule } = await supabase.from('regras_raridade').select('*').eq('raridade_nome', name).single();
    
    if (rule) {
        document.getElementById('modalRuleName').value = rule.raridade_nome;
        document.getElementById('modalRuleCost').value = rule.repetidas_para_evoluir;
        document.getElementById('modalRuleOrder').value = rule.ordem_evolucao;
        
        document.getElementById('editRuleModal').classList.remove('hidden');
    }
}

async function saveRarityFromModal() {
    const name = document.getElementById('modalRuleName').value;
    const custo = document.getElementById('modalRuleCost').value;
    const ordem = document.getElementById('modalRuleOrder').value;

    const { error } = await supabase.from('regras_raridade')
        .update({ repetidas_para_evoluir: custo, ordem_evolucao: ordem })
        .eq('raridade_nome', name);

    if (error) showToast("Erro: " + error.message, "error");
    else {
        showToast("Regra atualizada!");
        closeModal('editRuleModal');
        loadRarityRules();
        loadEvolutionCosts(); // Atualiza cache global
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
        document.getElementById('modalPackId').value = pack.id;
        document.getElementById('modalPackName').value = pack.nome;
        document.getElementById('modalPackPrice').value = pack.preco_moedas;
        document.getElementById('modalPackTotal').value = pack.cartas_total;
        
        // Chances
        document.getElementById('modalChanceComum').value = (pack.chance_comum * 100).toFixed(1);
        document.getElementById('modalChanceRara').value = (pack.chance_rara * 100).toFixed(1);
        document.getElementById('modalChanceEpica').value = (pack.chance_epica * 100).toFixed(1);
        document.getElementById('modalChanceLendaria').value = (pack.chance_lendaria * 100).toFixed(1);
        document.getElementById('modalChanceMitica').value = (pack.chance_mitica * 100).toFixed(1);
        
        document.getElementById('modalPackCurrentUrl').value = pack.imagem_url || "";
        
        document.getElementById('editPackModal').classList.remove('hidden');
    }
}

async function savePackFromModal() {
    const id = document.getElementById('modalPackId').value;
    const nome = document.getElementById('modalPackName').value;
    const preco = document.getElementById('modalPackPrice').value;
    const total = document.getElementById('modalPackTotal').value;
    
    // Imagem
    const file = document.getElementById('modalPackFile').files[0];
    let imgUrl = document.getElementById('modalPackCurrentUrl').value;
    
    if (file) {
        const compressed = await compressImage(file);
        const fileName = `packs/pack_${Date.now()}.jpeg`;
        const { error } = await supabase.storage.from(BUCKET_NAME).upload(fileName, compressed);
        if(!error) {
            const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
            imgUrl = data.publicUrl;
        }
    }

    const chances = {
        chance_comum: parseFloat(document.getElementById('modalChanceComum').value) / 100,
        chance_rara: parseFloat(document.getElementById('modalChanceRara').value) / 100,
        chance_epica: parseFloat(document.getElementById('modalChanceEpica').value) / 100,
        chance_lendaria: parseFloat(document.getElementById('modalChanceLendaria').value) / 100,
        chance_mitica: parseFloat(document.getElementById('modalChanceMitica').value) / 100
    };

    const { error } = await supabase.from('pacotes').update({
        nome, preco_moedas: preco, cartas_total: total, imagem_url: imgUrl, ...chances
    }).eq('id', id);

    if (error) showToast("Erro: " + error.message, "error");
    else {
        showToast("Pacote atualizado!");
        closeModal('editPackModal');
        loadPacks();
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
    
    // Adicionei data-label nas TDs abaixo:
    let html = '<table><thead><tr><th>Nome</th><th>Email</th><th>Moedas</th><th>Ações</th></tr></thead><tbody>';
    players.forEach(player => {
        html += `<tr>
                <td data-label="Nome">${player.nome}</td>
                <td data-label="Email">${player.email}</td>
                <td data-label="Moedas">${player.moedas}</td>
                <td data-label="Ações"><button class="edit-player-btn" data-id="${player.id}"><i class="fas fa-edit"></i></button></td>
            </tr>`;
    });
    html += '</tbody></table>';
    listContainer.innerHTML = html;
    document.querySelectorAll('.edit-player-btn').forEach(button => button.addEventListener('click', handleEditPlayer));
}

/* ==========================================================
   3. JOGADORES (MODAL)
   ========================================================== */
async function handleEditPlayer(event) {
    const id = event.currentTarget.dataset.id;
    currentEditPlayerId = id;
    const { data: player } = await supabase.from('jogadores').select('*').eq('id', id).single();
    
    if(player) {
        document.getElementById('modalPlayerId').value = player.id;
        document.getElementById('modalPlayerEmail').value = player.email;
        document.getElementById('modalPlayerName').value = player.nome;
        document.getElementById('modalPlayerMoedas').value = player.moedas;
        document.getElementById('modalPlayerNivel').value = player.nivel;
        
        document.getElementById('editPlayerModal').classList.remove('hidden');
    }
}

async function savePlayerFromModal() {
    const id = document.getElementById('modalPlayerId').value;
    const nome = document.getElementById('modalPlayerName').value;
    const moedas = document.getElementById('modalPlayerMoedas').value;
    const nivel = document.getElementById('modalPlayerNivel').value;

    const { error } = await supabase.from('jogadores')
        .update({ nome, moedas, nivel })
        .eq('id', id);

    if (error) showToast("Erro: " + error.message, "error");
    else {
        showToast("Jogador atualizado!");
        closeModal('editPlayerModal');
        loadPlayers();
    }
}

async function savePlayerEdit() {
    const id = document.getElementById('playerEditId').value;
    
    // 🚨 MUDANÇA 2: Coleta o NOME do campo de input
    const nome = document.getElementById('playerEditName').value.trim(); 
    
    const moedas = parseInt(document.getElementById('playerEditMoedas').value);
    const nivel = parseInt(document.getElementById('playerEditNivel').value);
    
    if (!id || !nome || isNaN(moedas) || isNaN(nivel)) {
        alert("Preencha todos os campos corretamente (Nome, Moedas, Nível)!");
        return;
    }

    const { error } = await supabase.from('jogadores')
        // 🚨 MUDANÇA 3: Inclui o 'nome' no objeto de atualização
        .update({ nome, moedas, nivel }) 
        .eq('id', id);

    if (error) {
        console.error("Erro ao atualizar jogador:", error);
        alert(`Erro ao atualizar jogador "${nome}": ${error.message}`);
    } else {
        alert(`Jogador "${nome}" atualizado com sucesso!`);
        document.getElementById('playerEditFormSection').style.display = 'none';
        await loadPlayers();
    }
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

/* === SISTEMA DE ABAS === */
function openTab(tabId) {
    // 1. Esconde todo o conteúdo
document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
const clickedBtn = document.querySelector(`button[onclick="openTab('${tabId}')"]`);
    if(clickedBtn) clickedBtn.classList.add('active');

// Loaders Específicos
    if (tabId === 'tab-base') loadBasesList(); // <--- NOVO: Carrega a lista de bases
    if (tabId === 'tab-cards') loadUnifiedView(); // Recarrega cartas
    if (tabId === 'tab-players') loadPlayers();
    if (tabId === 'tab-packs') loadPacks();
    if (tabId === 'tab-origins') loadOriginCovers();
    if (tabId === 'tab-rules') loadRarityRules();
    if (tabId === 'tab-games') loadMinigames(); // <--- NOVO
    if (tabId === 'tab-daily') loadDailyRewards();
}

async function deleteOriginCover(id) {
    if(confirm("Deletar essa capa?")) {
        await supabase.from('capas_origens').delete().eq('id', id);
        loadOriginCovers();
    }
}

/* === CARREGAR LISTA DE BASES (ABA 1) === */
async function loadBasesList() {
    const container = document.getElementById("basesListContainer");
    if (!container) return;
    container.innerHTML = '<div style="color:#aaa;">Carregando bases...</div>';

    const { data: bases, error } = await supabase
        .from("personagens_base")
        .select('*')
        .order("origem", { ascending: true })
        .order("personagem", { ascending: true });

    if (error) { container.innerHTML = "Erro ao carregar."; return; }
    if (!bases.length) { container.innerHTML = "Nenhuma base cadastrada."; return; }

    updateNameDatalist(bases); // Atualiza o autocomplete

    // 1. Agrupa por Origem
    const grouped = bases.reduce((acc, base) => {
        (acc[base.origem] = acc[base.origem] || []).push(base);
        return acc;
    }, {});

    let html = '';

    // 2. Gera HTML agrupado
    for (const [origem, baseList] of Object.entries(grouped)) {
        html += `
            <div class="origin-group-bases">
                <h3>${origem}</h3>
                <div class="bases-grid">
        `;

        baseList.forEach(base => {
            const elementStyles = getElementStyles(base.elemento);
            html += `
                <div class="base-item-card" style="border-left-color: ${elementStyles.primary}">
                    <div class="base-info">
                        <h4>${base.personagem}</h4>
                        <span>${base.elemento}</span>
                    </div>
                    <div class="base-actions">
                        <button class="btn-edit-base" onclick="handleEditBaseCharacterClick('${base.id_base}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-delete-base" onclick="handleDeleteBaseCharacterClick('${base.id_base}', '${base.personagem}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`; // Fecha grid e group
    }

    container.innerHTML = html;
}

// 2. Função de Carregar
async function loadMinigames() {
    const container = document.getElementById("minigamesContainer");
    container.innerHTML = 'Carregando games...';
    
    const { data: games, error } = await supabase.from('minigame').select('*').order('id');
    
    if(error) { container.innerHTML = 'Erro ao carregar.'; return; }
    
    let html = '';
    games.forEach(game => {
        html += `
            <div class="base-item-card" style="border-left-color: #9b59b6;">
                <div class="base-info">
                    <h4>${game.nome}</h4>
                    <span style="color:#FFD700">💰 ${game.moedas_recompensa} Moedas (x${game.multiplicador})</span>
                </div>
                <div class="base-actions">
                    <button class="btn-edit-base" onclick="handleEditGameClick('${game.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Carregar Lista
async function loadDailyRewards() {
    const container = document.getElementById("dailyListContainer");
    container.innerHTML = 'Carregando calendário...';

    const { data: days, error } = await supabase
        .from('recompensas_diarias')
        .select('*')
        .order('dia', { ascending: true });

    if (error) { showToast("Erro ao carregar diário", "error"); return; }

    let html = '';
    days.forEach(day => {
        const isPack = day.tipo === 'pacote';
        const color = isPack ? '#9b59b6' : '#f1c40f';
        const icon = isPack ? '<i class="fas fa-box-open"></i>' : '<i class="fas fa-coins"></i>';
        const valueText = isPack ? `Pacote ID: ${day.valor}` : `${day.valor} Moedas`;

        html += `
            <div class="base-item-card" style="border-left-color: ${color};">
                <div class="base-info">
                    <h4 style="color:${color}">Dia ${day.dia}</h4>
                    <span style="font-weight:bold; color:white; font-size:1.1em;">${day.descricao}</span>
                    <span style="font-size:0.9em; opacity:0.8;">${icon} ${valueText}</span>
                </div>
                <div class="base-actions">
                    <button class="btn-edit-base" onclick="handleEditDailyClick(${day.dia})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-delete-base" onclick="handleDeleteDailyClick(${day.dia})" title="Excluir Dia">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Função para Deletar Dia
window.handleDeleteDailyClick = async (dia) => {
    if(confirm(`Tem certeza que deseja excluir o Dia ${dia}? Isso pode criar um buraco na sequência.`)) {
        const { error } = await supabase.from('recompensas_diarias').delete().eq('dia', dia);
        
        if(error) showToast("Erro ao excluir", "error");
        else {
            showToast("Dia removido.");
            loadDailyRewards();
        }
    }
};

// Wrapper para o clique
window.handleEditDailyClick = async (dia) => {
    const { data: dayData } = await supabase.from('recompensas_diarias').select('*').eq('dia', dia).single();
    
    if(dayData) {
        document.getElementById('modalDailyDay').value = dayData.dia;
        document.getElementById('modalDailyDayDisplay').textContent = dayData.dia;
        document.getElementById('modalDailyDesc').value = dayData.descricao;
        document.getElementById('modalDailyType').value = dayData.tipo;
        document.getElementById('modalDailyValue').value = dayData.valor;
        toggleDailyInputs(dayData.tipo);
        document.getElementById('editDailyModal').classList.remove('hidden');
    }
};

function toggleDailyInputs(type) {
    const label = document.getElementById('labelDailyValue');
    const hint = document.getElementById('packIdHint');
    
    if (type === 'pacote') {
        label.textContent = "ID do Pacote:";
        hint.style.display = 'block';
    } else {
        label.textContent = "Quantidade de Moedas:";
        hint.style.display = 'none';
    }
}

// Função para Adicionar Novo Dia (Pega o último + 1)
document.getElementById('addDailyBtn').addEventListener('click', async () => {
    // 1. Descobre qual é o último dia atual
    const { data: maxData } = await supabase
        .from('recompensas_diarias')
        .select('dia')
        .order('dia', { ascending: false })
        .limit(1);
    
    let nextDay = 1;
    if (maxData && maxData.length > 0) {
        nextDay = maxData[0].dia + 1;
    }

    // 2. Cria o novo dia com valor padrão
    const { error } = await supabase.from('recompensas_diarias').insert([{
        dia: nextDay,
        tipo: 'moedas',
        valor: 100,
        descricao: `Prêmio do Dia ${nextDay}`
    }]);

    if (error) {
        showToast("Erro ao criar dia: " + error.message, "error");
    } else {
        showToast(`Dia ${nextDay} adicionado!`);
        loadDailyRewards(); // Recarrega a lista
    }
});

// Wrappers globais para os onlicks do HTML funcionarem
window.handleEditBaseCharacterClick = async (id) => {
    // Simula o evento que sua função original espera
    const mockEvent = { currentTarget: { dataset: { id: id } } };
    handleEditBaseCharacter(mockEvent);
};

window.handleDeleteBaseCharacterClick = async (id, name) => {
    const mockEvent = { currentTarget: { dataset: { id: id, name: name } } };
    handleDeleteBaseCharacter(mockEvent);
};

// Função para abrir/fechar acordeão
window.toggleOrigin = function(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.fa-chevron-down');
    
    content.classList.toggle('expanded');
    
    // Gira o ícone
    if (content.classList.contains('expanded')) {
        icon.style.transform = "rotate(180deg)";
    } else {
        icon.style.transform = "rotate(0deg)";
    }
}

// Wrappers para Cartas (para usar no onclick string)
window.handleEditCardClick = async (id) => {
    const mockEvent = { currentTarget: { dataset: { id: id } } };
    handleEdit(mockEvent); // Chama sua função original de modal de carta
};

window.handleDeleteCardClick = async (id, name) => {
    const mockEvent = { currentTarget: { dataset: { id: id, name: name } } };
    handleDelete(mockEvent);
};

// 4. Handle Click (Wrapper)
window.handleEditGameClick = async (id) => {
    currentEditGameId = id;
    const { data: game } = await supabase.from('minigame').select('*').eq('id', id).single();
    
    if(game) {
        document.getElementById('modalGameId').value = game.id;
        document.getElementById('modalGameName').value = game.nome;
        document.getElementById('modalGameDiff').value = game.dificuldade; // No seu SQL é integer, no form input number
        document.getElementById('modalGameReward').value = game.moedas_recompensa;
        document.getElementById('modalGameMulti').value = game.multiplicador;
        
        document.getElementById('editGameModal').classList.remove('hidden');
    }
};

window.deleteOriginCover = deleteOriginCover;

document.getElementById("cardName").addEventListener("input", previewCard);

// --- LISTENERS ---

// 1. Inputs de Preview (Seguro)
const fileInput = document.getElementById("fileInput");
if (fileInput) fileInput.addEventListener("change", previewCard);

const inputsPreview = ["cardName", "cardPower", "cardRarity"];
inputsPreview.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("input", previewCard);
        if (id === "cardRarity") el.addEventListener("change", previewCard);
    }
});

// 2. Botões Principais (Seguro com Optional Chaining '?.')
document.getElementById("saveCardBtn")?.addEventListener("click", saveNewCard);
document.getElementById("saveBaseBtn")?.addEventListener("click", saveBasePersonagem);
document.getElementById("savePackBtn")?.addEventListener("click", saveOrUpdatePack);
document.getElementById("newPackBtn")?.addEventListener("click", resetPackForm);
document.getElementById("savePlayerEditBtn")?.addEventListener("click", savePlayerEdit);
document.getElementById("saveOriginCoverBtn")?.addEventListener("click", saveOriginCover);
document.getElementById("cancelEditBtn")?.addEventListener("click", cancelEditCard);
document.getElementById("saveRarityBtn")?.addEventListener("click", saveRarityRule);

// 3. Botões de Salvar dos Modais
document.getElementById("modalSaveBtn")?.addEventListener("click", saveCardFromModal);
document.getElementById('modalSaveBaseBtn')?.addEventListener('click', saveBaseFromModal);
document.getElementById('modalSavePackBtn')?.addEventListener('click', savePackFromModal);
document.getElementById('modalSavePlayerBtn')?.addEventListener('click', savePlayerFromModal);
document.getElementById('modalSaveRuleBtn')?.addEventListener('click', saveRarityFromModal);

// 4. Botão Salvar Game (Economia)
// 1. Listener do Botão Salvar Game
const btnSaveGame = document.getElementById('modalSaveGameBtn');
if (btnSaveGame) {
    console.log("✅ Botão Salvar Game ENCONTRADO!");
    btnSaveGame.addEventListener('click', async () => {
        console.log("Clicou em Salvar Game...");
        const id = document.getElementById('modalGameId').value;
        const reward = document.getElementById('modalGameReward').value;
        const multi = document.getElementById('modalGameMulti').value;
        
        const { error } = await supabase.from('minigame')
            .update({ moedas_recompensa: reward, multiplicador: multi })
            .eq('id', id);
            
        if(error) {
            console.error(error);
            showToast("Erro ao salvar game: " + error.message, "error");
        } else {
            showToast("Economia atualizada!");
            closeModal('editGameModal');
            loadMinigames();
        }
    });
} else {
    console.error("❌ ERRO CRÍTICO: Botão 'modalSaveGameBtn' NÃO existe no HTML.");
}

// 2. Listener do Botão Salvar Diário
const btnSaveDaily = document.getElementById('modalSaveDailyBtn');
if (btnSaveDaily) {
    console.log("✅ Botão Salvar Diário ENCONTRADO!");
    btnSaveDaily.addEventListener('click', async () => {
        console.log("Clicou em Salvar Diário...");
        const dia = document.getElementById('modalDailyDay').value;
        const desc = document.getElementById('modalDailyDesc').value;
        const tipo = document.getElementById('modalDailyType').value;
        const valor = parseInt(document.getElementById('modalDailyValue').value);

        const { error } = await supabase.from('recompensas_diarias')
            .update({ descricao: desc, tipo: tipo, valor: valor })
            .eq('dia', dia);

        if (error) showToast("Erro ao salvar", "error");
        else {
            showToast(`Dia ${dia} atualizado!`);
            closeModal('editDailyModal');
            loadDailyRewards();
        }
    });
} else {
    console.error("❌ ERRO CRÍTICO: Botão 'modalSaveDailyBtn' NÃO existe no HTML.");
}

// 6. Listener do Select de Tipo (Diário)
const typeSelect = document.getElementById('modalDailyType');
if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
        toggleDailyInputs(e.target.value);
    });
}
