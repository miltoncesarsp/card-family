// NÃO declare supabase aqui, ele já vem do supabaseClient.js

// Função para compressão de imagem
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

      canvas.toBlob(
        (blob) => resolve(blob),
        "image/jpeg",
        0.8
      );
    };
  });
}

// Função para criar o preview do card
function previewCard() {
  const name = document.getElementById("cardName").value.trim() || "Desconhecido";
  const power = parseInt(document.getElementById("cardPower").value) || 0;
  const rarity = document.getElementById("cardRarity").value || "Comum";
  const element = document.getElementById("cardElement").value || "Ar";
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  const previewDiv = document.getElementById("cardPreview");
  previewDiv.innerHTML = ""; // Limpa preview

  const cardData = {
    Personagem: name,
    Forca: power,
    Raridade: rarity,
    Elemento: element,
    imagem: file ? URL.createObjectURL(file) : ""
  };

  const cardElement = createCardElement(cardData);
  previewDiv.appendChild(cardElement);
}

// Função para criar o card visual
function createCardElement(cardData) {
  const div = document.createElement("div");

  const elemento = cardData.Elemento || "Ar";
  const raridade = cardData.Raridade || "Comum";
  const personagem = cardData.Personagem || "Desconhecido";
  const forca = cardData.Forca || 0;

  // Definição de cores por raridade
  let colorCode;
  switch (raridade.toLowerCase()) {
    case "mítica": colorCode = "#ffc300"; break;
    case "lendária": colorCode = "#e67e22"; break;
    case "épica": colorCode = "#9b59b6"; break;
    case "rara": colorCode = "#3498db"; break;
    default: colorCode = "#95a5a6"; // Comum
  }

  const raridadeClass = "rarity-" + raridade.toLowerCase()
    .replace(/é/g, "e").replace(/á/g, "a").replace(/í/g, "i");

  const elementoClass = elemento.toLowerCase().replace("á", "a");

  div.className = "card " + raridadeClass + " " + elementoClass;
  div.style.backgroundImage = cardData.imagem ? "url('" + cardData.imagem + "')" : "";
  div.style.height = "350px";

  div.innerHTML = `
    <div class="rarity-badge" style="background-color:${colorCode};">${raridade}</div>
    <div class="card-name-footer" style="background:${colorCode}DD;">
      <span class="card-name-text">${personagem}</span>
      <span class="card-force-circle" style="background-color:${colorCode};">${forca}</span>
    </div>
  `;

  return div;
}

// Upload da carta para o Supabase
async function uploadCard() {
  const name = document.getElementById("cardName").value.trim();
  const power = parseInt(document.getElementById("cardPower").value);
  const rarity = document.getElementById("cardRarity").value;
  const element = document.getElementById("cardElement").value;
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!name || !rarity || !element || !power || !file) {
    alert("Preencha todos os campos e selecione uma imagem!");
    return;
  }

  // Buscar origem do personagem (case-insensitive)
  const { data: baseData, error: baseError } = await supabase
    .from("Personagens_Base")
    .select("Origem")
    .ilike("Personagem", name)
    .limit(1);

  if (baseError || !baseData || baseData.length === 0) {
    console.error("Erro ao buscar origem:", baseError);
    alert("Não foi possível encontrar a origem do personagem!");
    return;
  }

  const origem = baseData[0].Origem;

  // Compressão da imagem
  const compressed = await compressImage(file);

  // Upload no bucket cards / subpasta da origem
  const filePath = `cards/${origem}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("cards")
    .upload(filePath, compressed);

  if (uploadError) {
    console.error("Erro no upload:", uploadError);
    alert("Erro ao enviar imagem!");
    return;
  }

  // Pegar URL pública
  const { data: publicUrl } = supabase.storage
    .from("cards")
    .getPublicUrl(filePath);

  const imageUrl = publicUrl.publicUrl;

  // Salvar no banco
  const { error: dbError } = await supabase
    .from("cards")
    .insert([{ name, rarity, element, power, image_url: imageUrl }]);

  if (dbError) {
    console.error("Erro ao salvar no banco:", dbError);
    alert("Erro ao salvar no banco!");
    return;
  }

  alert("Carta salva com sucesso!");
  document.getElementById("cardForm").reset();
  previewCard(); // Limpa preview
}

// --- Eventos para preview em tempo real ---
document.getElementById("cardName").addEventListener("input", previewCard);
document.getElementById("cardPower").addEventListener("input", previewCard);
document.getElementById("cardRarity").addEventListener("change", previewCard);
document.getElementById("cardElement").addEventListener("change", previewCard);
document.getElementById("fileInput").addEventListener("change", previewCard);
