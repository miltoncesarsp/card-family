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

    const rarityStyles = getRarityColors(rarity); // Cores da Raridade
    const elementStyles = getElementStyles(element); // Cores do Elemento
  const rarityTextColor = rarity.toLowerCase() === "mítica" ? "#333" : "white";

    if (file) div.style.backgroundImage = `url(${URL.createObjectURL(file)})`;

 div.innerHTML = `
        <div class="rarity-badge" 
            style="background-color: ${rarityStyles.primary}; 
                   color: ${rarityTextColor};"> ${rarity}
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
                primary: "#8B4513", // Marrom
                background: "linear-gradient(135deg, #A0522D 0%, #6B8E23 100%)" // Marrom para Verde Oliva
            };
        case "fogo":
            return {
                primary: "#FF4500", // Laranja Vermelho
                background: "linear-gradient(135deg, #FF4500 0%, #FFD700 100%)" // Laranja para Ouro
            };
        case "água":
            return {
                primary: "#1E90FF", // Azul Forte
                background: "linear-gradient(135deg, #1E90FF 0%, #87CEEB 100%)" // Azul Real para Azul Céu
            };
        case "ar":
            return {
                primary: "#ADD8E6", // Azul Claro
                background: "linear-gradient(135deg, #ADD8E6 0%, #FFFFFF 100%)" // Azul Claro para Branco
            };
        case "tecnologia":
            return {
                primary: "#00CED1", // Turquesa Escuro
                background: "linear-gradient(135deg, #00CED1 0%, #191970 100%)" // Turquesa para Azul Marinho
            };
        case "luz":
            return {
                primary: "#FFD700", // Ouro
                background: "linear-gradient(135deg, #FFD700 0%, #FFFFE0 100%)" // Ouro para Amarelo Claro
            };
        case "sombra":
            return {
                primary: "#4B0082", // Índigo Escuro
                background: "linear-gradient(135deg, #4B0082 0%, #000000 100%)" // Índigo para Preto
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

// Listeners
document.getElementById("fileInput").addEventListener("change", previewCard);
document.getElementById("cardName").addEventListener("input", previewCard);
document.getElementById("cardPower").addEventListener("input", previewCard);
document.getElementById("cardRarity").addEventListener("change", previewCard);
document.getElementById("cardElement").addEventListener("change", previewCard);
document.getElementById("saveCardBtn").addEventListener("click", uploadCard);
