// NÃO declare supabase aqui, ele já vem do supabaseClient.js

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

async function uploadCard() {
  const name = document.getElementById("cardName").value.trim();
  const level = parseInt(document.getElementById("cardLevel").value);
  const rarity = document.getElementById("cardRarity").value;
  const element = document.getElementById("cardElement").value;
  const power = parseInt(document.getElementById("cardPower").value);
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!name || !rarity || !element || !power || !level || !file) {
    alert("Preencha todos os campos!");
    return;
  }

  // 1️⃣ Buscar origem do personagem
  const { data: baseData, error: baseError } = await supabase
    .from("personagens_base")
    .select("origem, id_base")
    .eq("personagem", name)
    .single();

  if (baseError || !baseData) {
    console.error("Erro ao buscar origem:", baseError);
    alert("Não foi possível encontrar a origem do personagem!");
    return;
  }

  const origem = baseData.origem;
  const id_base = baseData.id_base;

  // 2️⃣ Compressão da imagem
  const compressed = await compressImage(file);

  // 3️⃣ Upload no bucket cards, subpasta por origem
  const filePath = `cards/${origem}/${id_base}_${level}_${Date.now()}.jpeg`;
  const { error: uploadError } = await supabase.storage
    .from("cards")
    .upload(filePath, compressed);

  if (uploadError) {
    console.error("Erro no upload:", uploadError);
    alert("Erro ao enviar imagem!");
    return;
  }

  // 4️⃣ Pegar URL pública
  const { data: publicUrl } = supabase.storage
    .from("cards")
    .getPublicUrl(filePath);

  const imageUrl = publicUrl.publicUrl;

  // 5️⃣ Inserir na tabela cartas_nivel
  const { error: dbError } = await supabase
    .from("cartas_nivel")
    .insert([{
      id_base,
      nivel: level,
      raridade: rarity,
      forca: power,
      element: element,
      imagem_url: imageUrl
    }]);

  if (dbError) {
    console.error("Erro ao salvar no banco:", dbError);
    alert("Erro ao salvar no banco!");
    return;
  }

  alert("Carta salva com sucesso!");
  document.getElementById("cardForm").reset();
  document.getElementById("cardPreview").src = "";
}

function previewCard() {
  const name = document.getElementById("cardName").value.trim() || "Desconhecido";
  const rarity = document.getElementById("cardRarity").value || "Comum";
  const element = document.getElementById("cardElement").value || "Ar";
  const power = parseInt(document.getElementById("cardPower").value) || 0;
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!file) {
    alert("Selecione uma imagem para o preview!");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const cardData = {
      Personagem: name,
      Raridade: rarity,
      Elemento: element,
      Forca: power,
      imagem: e.target.result // URL da imagem selecionada
    };

    const previewDiv = createCardElement(cardData);
    const container = document.getElementById("previewContainer");
    container.innerHTML = "";
    container.appendChild(previewDiv);
  };
  reader.readAsDataURL(file);
}

// Função adaptada do seu antigo código para criar o elemento da carta
function createCardElement(cardData) {
  const div = document.createElement('div');

  const elemento = cardData.Elemento;
  const raridade = cardData.Raridade;
  const personagem = cardData.Personagem;
  const forca = cardData.Forca;

  let colorCode;
  switch (raridade.toLowerCase()) {
    case 'mítica': colorCode = '#ffc300'; break;
    case 'lendária': colorCode = '#e67e22'; break;
    case 'épica': colorCode = '#9b59b6'; break;
    case 'rara': colorCode = '#3498db'; break;
    default: colorCode = '#95a5a6';
  }

  div.className = "card rarity-" + raridade.toLowerCase() + " " + elemento.toLowerCase();
  div.style.backgroundImage = `url('${cardData.imagem}')`;
  div.style.height = '350px';
  div.style.width = '250px';
  div.style.backgroundSize = 'cover';
  div.style.position = 'relative';
  div.style.borderRadius = '10px';
  div.style.overflow = 'hidden';

  div.innerHTML = `
    <div class="rarity-badge" style="background-color:${colorCode};position:absolute;top:5px;left:5px;padding:2px 6px;border-radius:4px;color:white;font-weight:bold;">
      ${raridade}
    </div>
    <div class="card-name-footer" style="position:absolute;bottom:0;width:100%;background:${colorCode}AA;display:flex;justify-content:space-between;padding:5px;box-sizing:border-box;">
      <span>${personagem}</span>
      <span>${forca}</span>
    </div>
  `;

  return div;
}
