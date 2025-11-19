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

  const colorCode = getRarityColor(rarity);
  if (file) div.style.backgroundImage = `url(${URL.createObjectURL(file)})`;

  div.innerHTML = `
    <div class="rarity-badge" style="background-color:${colorCode}">${rarity}</div>
    <div class="card-element-badge">${getElementIcon(element)}</div>
    <div class="card-name-footer">${name}</div>
    <div class="card-force-circle">${power}</div>
  `;

  container.appendChild(div);
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
