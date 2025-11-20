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

// Cores do badge de raridade
function getRarityColor(rarity) {
  switch (rarity.toLowerCase()) {
    case "mítica": return "#FFD700";
    case "lendária": return "#E67E22";
    case "épica": return "#9B59B6";
    case "rara": return "#3498DB";
    default: return "#95A5A6";
  }
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
        case "mítica":
            primaryColor = "#FFD700"; // Ouro
            break;
        case "lendária":
            primaryColor = "#FF8C00"; // Laranja
            break;
        case "épica":
            primaryColor = "#9932CC"; // Roxo
            break;
        case "rara":
            primaryColor = "#1E90FF"; // Azul
            break;
        default:
            primaryColor = "#A9A9A9"; // Cinza
            break;
    }
    return { primary: primaryColor};
}

// Preview da carta
function previewCard() {
    const name = document.getElementById("cardName").value.trim();
    const power = document.getElementById("cardPower").value;
    const rarity = document.getElementById("cardRarity").value;
    const element = document.getElementById("cardElement").value;
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    const container = document.getElementById("cardPreviewContainer");
    container.innerHTML = "";

    if (!name && !power && !file) return;

    const div = document.createElement("div");
    div.className = "card-preview";

    const rarityStyles = getRarityColors(rarity);
    const elementStyles = getElementStyles(element); 
    
    // NOVO: A cor do texto da raridade é SEMPRE branca, conforme solicitado.
    const rarityTextColor = "white"; // <-- Ajustado para ser sempre branco

    if (file) div.style.backgroundImage = `url(${URL.createObjectURL(file)})`;

    div.innerHTML = `
        <div class="rarity-badge" 
            style="background-color: ${rarityStyles.primary}; 
                   color: ${rarityTextColor};">
            ${rarity}
        </div>
        
        <div class="card-element-badge"
             style="background: ${elementStyles.background};">
            ${getElementIcon(element)}
        </div>
        
        <div class="card-name-footer" 
            style="background-color: ${rarityStyles.primary}">
            ${name}
        </div>
        
        <div class="card-force-circle"
            style="background-color: ${rarityStyles.primary};
                   color: white; 
                   border-color: white;"> 
            ${power}
        </div>
    `;

    container.appendChild(div);
}

function getElementStyles(element) {
    switch (element.toLowerCase()) {
        case "terra":
            return {
                primary: "#8B4513", 
                background: "linear-gradient(135deg, #A0522D 0%, #6B8E23 100%)" 
            };
        case "fogo":
            return {
                primary: "#FF4500", 
                background: "linear-gradient(135deg, #FF4500 0%, #FFD700 100%)" 
            };
        case "água":
            return {
                primary: "#1E90FF", 
                background: "linear-gradient(135deg, #1E90FF 0%, #87CEEB 100%)" 
            };
        case "ar":
            return {
                primary: "#5F9EA0", // Azul Acinzentado (Mais escuro)
                // NOVO GRADIENTE: Usando tons de cinza/azul para garantir contraste
                background: "linear-gradient(135deg, #708090 0%, #B0C4DE 100%)" // Cinza Ardósia para Azul Claro
            };
        case "tecnologia":
            return {
                primary: "#00CED1", 
                background: "linear-gradient(135deg, #00CED1 0%, #191970 100%)" 
            };
        case "luz":
            return {
                primary: "#DAA520", // Dourado mais escuro (Goldenrod)
                // NOVO GRADIENTE: Garantindo que a parte mais escura seja visível
                background: "linear-gradient(135deg, #FFD700 0%, #DAA520 100%)" // Ouro para Dourado Escuro
            };
        case "sombra":
            return {
                primary: "#4B0082", 
                background: "linear-gradient(135deg, #4B0082 0%, #000000 100%)" 
            };
        default:
            return { primary: "#A9A9A9", background: "#A9A9A9" };
    }
}
// Upload da carta
async function uploadCard() {
const name = document.getElementById("cardName").value.trim();
  const rarity = document.getElementById("cardRarity").value;
  const element = document.getElementById("cardElement").value;
  const power = parseInt(document.getElementById("cardPower").value);
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!name || !rarity || !element || !power || !file) {
    alert("Preencha todos os campos e selecione uma imagem!");
    return;
  }

const { data: baseDataArray, error: baseError } = await supabase
        .from("personagens_base")
        .select("id_base, origem") // Pega os campos de ligação e agrupamento
        .eq("personagem", name); // Filtra pelo nome fornecido

    if (baseError || !baseDataArray || baseDataArray.length === 0) {
        // Usa baseDataArray.length para verificar se encontrou (mais seguro que .single())
        console.error("Erro ao buscar base:", baseError || "Personagem não encontrado.");
        alert("Não foi possível encontrar a origem ou ID base do personagem! Verifique a grafia.");
        return;
    }

    const { id_base, origem } = baseDataArray[0]; // Pega os dados do primeiro resultado
  
  const compressed = await compressImage(file);
  const filePath = `cards/${origem}/${Date.now()}_${file.name}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("cards")
    .upload(filePath, compressed);

  if (uploadError) {
    console.error("Erro no upload:", uploadError);
    alert("Erro ao enviar imagem!");
    return;
  }

  const { data: publicUrl } = supabase.storage.from("cards").getPublicUrl(filePath);
const imageUrl = publicUrl.publicUrl;

    // 2. Inserção na tabela 'cards' (Agora incluindo o id_base)
    const { error: dbError } = await supabase.from("cards")
        .insert([{ 
            name, 
            rarity, 
            element, 
            power, 
            image_url: imageUrl,
            id_base: id_base // <-- CHAVE LIGADA!
        }]);

  if (dbError) {
    console.error("Erro ao salvar no banco:", dbError);
    alert("Erro ao salvar no banco!");
    return;
  }

  alert("Carta salva com sucesso!");
  document.getElementById("cardForm").reset();
  document.getElementById("cardPreviewContainer").innerHTML = "";
}

/**
 * Agrupa um array de objetos por uma chave específica.
 * @param {Array<Object>} list O array de cartas.
 * @param {string} key A chave para agrupar (neste caso, 'origem').
 * @returns {Object<string, Array>} Um objeto onde as chaves são as origens.
 */
function groupBy(list, key) {
    return list.reduce((acc, item) => {
        (acc[item[key]] = acc[item[key]] || []).push(item);
        return acc;
    }, {});
}

/**
 * Busca e exibe as cartas agrupadas por Origem.
 */
async function loadCards() {
const listContainer = document.getElementById("cardListContainer");
    listContainer.innerHTML = "Carregando cartas...";

// Busca das cartas fazendo JOIN implícito com personagens_base para pegar a origem
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

const groupedByOriginAndPersonagem = cards.reduce((acc, card) => {
        const origem = card.personagens_base ? card.personagens_base.origem : "Desconhecida";
        const personagem = card.personagens_base ? card.personagens_base.personagem : "Desconhecido";

        acc[origem] = acc[origem] || {};
        acc[origem][personagem] = acc[origem][personagem] || [];
        acc[origem][personagem].push(card);
        return acc;
    }, {});


    // 3. Renderiza na tela
    listContainer.innerHTML = "";
    
    // Iteração Nível 1: Origem (Marvel, DC, etc.)
    for (const [origem, personagens] of Object.entries(groupedByOriginAndPersonagem).sort(([a], [b]) => a.localeCompare(b))) {
        listContainer.innerHTML += `<h3 class="group-title">${origem}</h3>`;
        
        // Iteração Nível 2: Personagem (Hulk, Homem Aranha, etc.)
        for (const [personagem, cardArray] of Object.entries(personajes).sort(([a], [b]) => a.localeCompare(b))) {
            
            // Renderiza o título do personagem e uma linha para as cartas
            listContainer.innerHTML += `<h4 class="sub-title">${personagem}</h4>`;
            listContainer.innerHTML += `<div class="card-group-container card-evolution-line">`; 

            // O seu array 'cardArray' agora contém todas as raridades (Comum, Rara, Épica, etc.) para aquele personagem.
            
            // Iteração Nível 3: Cartas do Personagem (Ordem de Raridade)
            // É melhor ordenar aqui para que a linha de evolução faça sentido
            const rarityOrder = ["Comum", "Rara", "Épica", "Lendária", "Mítica"];
            cardArray.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));

            cardArray.forEach(card => {
                // ... (O código de renderização do card-preview.card-small aqui) ...
                // Use o HTML de renderização que já está no seu loadCards
            });
            
            listContainer.innerHTML += `</div>`; // Fecha card-group-container
        }
    }
}

async function saveBasePersonagem() {
    // REMOVA: const id_base = document.getElementById("baseId").value.trim(); <-- REMOVIDO
    const personagem = document.getElementById("basePersonagem").value.trim();
    const origem = document.getElementById("baseOrigem").value.trim();
    const elemento = document.getElementById("baseElemento").value;

    if (!personagem || !origem || !elemento) { // Removida a verificação do id_base
        alert("Preencha todos os campos do formulário Base!");
        return;
    }

    // O ID é gerado pelo banco. Não o inclua no insert.
    const { error: dbError } = await supabase.from("personagens_base")
        .insert([{ personagem, origem, elemento }]); // <-- id_base foi removido daqui

    if (dbError) {
        console.error("Erro ao salvar Base:", dbError);
        alert(`Erro ao salvar no banco (Base): ${dbError.message}`);
        return;
    }

    alert(`Personagem Base "${personagem}" salvo com sucesso!`);
    document.getElementById("baseForm").reset();
}

// Listeners
document.getElementById("fileInput").addEventListener("change", previewCard);
document.getElementById("cardName").addEventListener("input", previewCard);
document.getElementById("cardPower").addEventListener("input", previewCard);
document.getElementById("cardRarity").addEventListener("change", previewCard);
document.getElementById("cardElement").addEventListener("change", previewCard);
document.addEventListener("DOMContentLoaded", loadCards); 
document.getElementById("saveBaseBtn").addEventListener("click", saveBasePersonagem);
document.getElementById("saveCardBtn").addEventListener("click", async () => {
    await uploadCard();
    await loadCards(); // Recarrega a lista após salvar
});
