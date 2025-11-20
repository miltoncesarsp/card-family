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

  const { data: baseData, error: baseError } = await supabase
    .from("personagens_base")
    .select("origem")
    .eq("personagem", name)
    .single();

  if (baseError || !baseData) {
    console.error("Erro ao buscar origem:", baseError);
    alert("Não foi possível encontrar a origem do personagem!");
    return;
  }

  const origem = baseData.origem;
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

  const { error: dbError } = await supabase.from("cards")
    .insert([{ name, rarity, element, power, image_url: imageUrl }]);

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

    // 1. Busca todas as entradas da tabela 'personagens_base'
    const { data: baseData, error: baseError } = await supabase
        .from("personagens_base")
        .select("personagem, origem"); // Pega apenas o nome e a origem

    if (baseError) {
        console.error("Erro ao buscar personagens base:", baseError);
        listContainer.innerHTML = "Erro ao carregar a base de personagens.";
        return;
    }

    // Cria um mapa para buscar a origem rapidamente (key: nome da carta, value: origem)
    const originMap = baseData.reduce((map, item) => {
        map[item.personagem] = item.origem;
        return map;
    }, {});


    // 2. Busca todas as cartas da tabela 'cards'
    const { data: cards, error: cardsError } = await supabase
        .from("cards")
        .select("*");

    if (cardsError) {
        console.error("Erro ao buscar cartas:", cardsError);
        listContainer.innerHTML = "Erro ao carregar as cartas.";
        return;
    }

    if (!cards || cards.length === 0) {
        listContainer.innerHTML = "Nenhuma carta cadastrada.";
        return;
    }

    // 3. Adiciona a origem e agrupa as cartas em JavaScript (Mais rápido que fazer 50+ chamadas)
    let allCardsWithOrigin = cards.map(card => ({
        ...card,
        origem: originMap[card.name] || "Desconhecida" // Usa o mapa
    }));

    const groupedCards = allCardsWithOrigin.reduce((acc, card) => {
        (acc[card.origem] = acc[card.origem] || []).push(card);
        return acc;
    }, {});


    // 4. Renderiza na tela
    listContainer.innerHTML = "";
    
    // Converte em um array e ordena pelas chaves (Origem)
    const sortedGroups = Object.entries(groupedCards).sort(([a], [b]) => a.localeCompare(b));

    for (const [origem, cardArray] of sortedGroups) {
        let groupHtml = `<h3>${origem} (${cardArray.length} Cartas)</h3>`;
        groupHtml += `<div class="card-group-container">`;

        cardArray.forEach(card => {
            const rarityStyles = getRarityColors(card.rarity);
            const elementStyles = getElementStyles(card.element);
            const rarityTextColor = "white";

            groupHtml += `
                <div class="card-preview card-small" 
                     style="background-image: url(${card.image_url});">
                    <div class="rarity-badge" 
                        style="background-color: ${rarityStyles.primary}; 
                               color: ${rarityTextColor};">
                        ${card.rarity}
                    </div>
                    <div class="card-element-badge"
                         style="background: ${elementStyles.background};">
                        ${getElementIcon(card.element)}
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
        groupHtml += `</div>`;
        listContainer.innerHTML += groupHtml;
    }
}

// Listeners
document.getElementById("fileInput").addEventListener("change", previewCard);
document.getElementById("cardName").addEventListener("input", previewCard);
document.getElementById("cardPower").addEventListener("input", previewCard);
document.getElementById("cardRarity").addEventListener("change", previewCard);
document.getElementById("cardElement").addEventListener("change", previewCard);
document.getElementById("saveCardBtn").addEventListener("click", uploadCard);
document.addEventListener("DOMContentLoaded", loadCards); 
document.getElementById("saveCardBtn").addEventListener("click", async () => {
    await uploadCard();
    await loadCards(); // Recarrega a lista após salvar
});
