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
  console.log("Iniciando upload da carta...");

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

  // 1️⃣ Buscar origem do personagem na tabela Personagens_Base
  const { data: baseData, error: baseError } = await supabase
    .from("Personagens_Base")
    .select("Origem")
    .eq("Personagem", name)
    .single();

  if (baseError || !baseData) {
    console.error("Erro ao buscar origem:", baseError);
    alert("Não foi possível encontrar a origem do personagem!");
    return;
  }

  const origem = baseData.Origem;

  // 2️⃣ Compressão da imagem
  const compressed = await compressImage(file);

  // 3️⃣ Upload no bucket cards, subpasta pela origem
  const filePath = `cards/${origem}/${Date.now()}_${file.name}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
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

  // 5️⃣ Inserir na tabela Cartas_Nivel (ou cards)
  const { error: dbError } = await supabase
    .from("cards")
    .insert([
      {
        name,
        rarity,
        element,
        power,
        image_url: imageUrl
      }
    ]);

  if (dbError) {
    console.error("Erro ao salvar no banco:", dbError);
    alert("Erro ao salvar no banco!");
    return;
  }

  alert("Carta salva com sucesso!");
  document.getElementById("cardForm").reset();
}
