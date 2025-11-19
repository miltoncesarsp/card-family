// NÃO declare supabase aqui, ele já vem do supabaseClient.js

// Função para compactar imagens
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

// Preview da carta em tempo real
function previewCard() {
  const name = document.getElementById("cardName").value.trim();
  const power = document.getElementById("cardPower").value;
  const rarity = document.getElementById("cardRarity").value;
  const element = document.getElementById("cardElement").value;
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  const container = document.getElementById("cardPreviewContainer");
  container.innerHTML = ""; // Limpa o preview

  if (!name && !power && !file) return;

  const div = document.createElement("div");
  div.className = "card-preview";

  let colorCode;
  switch (rarity.toLowerCase()) {
    case "mítica": colorCode = "#ffc300"; break;
    case "lendária": colorCode = "#e67e22"; break;
    case "épica": colorCode = "#9b59b6"; break;
    case "rara": colorCode = "#3498db"; break;
    default: colorCode = "#95a5a6";
  }

  if (file) {
    div.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
  } else {
    div.style.backgroundImage = "";
  }

  div.style.height = "350px";
  div.innerHTML = `
    <div class="rarity-badge" style="background-color:${colorCode}">${rarity}</div>
    <div class="card-element-badge">${element}</div>
    <div class="card-name-footer" style="background: ${colorCode}DD;">
      <span class="card-name-text">${name}</span>
      <span class="card-force-circle" style="background-color:${colorCode}">${power}</span>
    </div>
  `;

  container.appendChild(div);
}

// Função para salvar carta no Supabase
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

  // Buscar origem do personagem
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

  // Compressão da imagem
  const compressed = await compressImage(file);

  // Upload no bucket cards / subpasta por origem
  const filePath = `cards/${origem}/${Date.now()}_${file.name}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("cards")
    .upload(filePath, compressed);

  if (uploadError) {
    console.error("Erro no upload:", uploadError);
    alert("Erro ao enviar imagem!");
    return;
  }

  // URL pública
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
  document.getElementById("cardPreviewContainer").innerHTML = "";
}

// Listeners
document.getElementById("fileInput").addEventListener("change", previewCard);
document.getElementById("cardName").addEventListener("input", previewCard);
document.getElementById("cardPower").addEventListener("input", previewCard);
document.getElementById("cardRarity").addEventListener("change", previewCard);
document.getElementById("cardElement").addEventListener("change", previewCard);
document.getElementById("saveCardBtn").addEventListener("click", uploadCard);
