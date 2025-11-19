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

function previewImage() {
  const fileInput = document.getElementById("fileInput");
  const preview = document.getElementById("cardPreview");
  const file = fileInput.files[0];
  if (file) {
    preview.src = URL.createObjectURL(file);
  } else {
    preview.src = "";
  }
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
