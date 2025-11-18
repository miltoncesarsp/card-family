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

  // Compressão opcional
  const compressed = await compressImage(file);

  // Upload no bucket 'cards'
  const filePath = `${Date.now()}_${file.name}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("cards")
    .upload(filePath, compressed);

  if (uploadError) {
    console.error("Erro no upload:", uploadError);
    alert("Erro ao enviar imagem!");
    return;
  }

  // Pegar URL pública do arquivo
  const { data: publicUrl } = supabase.storage
    .from("cards")
    .getPublicUrl(filePath);

  const imageUrl = publicUrl.publicUrl;

  // Inserir no banco de dados 'public.cards'
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

  // Limpar campos após salvar
  document.getElementById("cardForm").reset();
}
