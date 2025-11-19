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

// Função de preview da carta
function previewCard() {
  const name = document.getElementById("cardName").value.trim();
  const rarity = document.getElementById("cardRarity").value;
  const element = document.getElementById("cardElement").value;
  const power = document.getElementById("cardPower").value;
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  const container = document.getElementById("cardPreviewContainer");
  container.innerHTML = ''; // limpa o preview

  if (!name && !file) return;

  const cardDiv = document.createElement("div");
  cardDiv.className = "card-preview";
  cardDiv.style.border = "2px solid black";
  cardDiv.style.width = "200px";
  cardDiv.style.height = "300px";
  cardDiv.style.position = "relative";
  cardDiv.style.padding = "10px";
  cardDiv.style.backgroundColor = "#fff";

  cardDiv.innerHTML = `
    <div style="position:absolute; top:5px; left:5px; font-weight:bold;">${name || "Personagem"}</div>
    <div style="position:absolute; bottom:5px; right:5px;">${power || 0}</div>
    <div style="position:absolute; top:5px; right:5px;">${rarity}</div>
    <div style="position:absolute; bottom:5px; left:5px;">${element}</div>
  `;

  if (file) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.style.width = "100%";
    img.style.height = "70%";
    img.style.objectFit = "cover";
    cardDiv.appendChild(img);
  }

  container.appendChild(cardDiv);
}

// Função para upload da carta
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
    .from("Personagens_Base")
    .select("Origem")
    .eq("Personagem", name)
    .maybeSingle();

  if (!baseData) {
    console.error("Erro ao buscar origem:", baseError);
    alert("Não foi possível encontrar a origem do personagem! Verifique o nome exato na tabela.");
    return;
  }

  const origem = baseData.Origem;

  // Compressão
  const compressed = await compressImage(file);

  // Upload no bucket, subpasta pela origem
  const filePath = `cards/${origem}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
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

  // Inserir no banco
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
  document.getElementById("cardPreviewContainer").innerHTML = '';
}

// Event listeners para atualizar preview automaticamente
document.getElementById("fileInput").addEventListener("change", previewCard);
document.getElementById("cardName").addEventListener("input", previewCard);
document.getElementById("cardPower").addEventListener("input", previewCard);
document.getElementById("cardRarity").addEventListener("change", previewCard);
document.getElementById("cardElement").addEventListener("change", previewCard);
document.getElementById("saveButton").addEventListener("click", uploadCard);
