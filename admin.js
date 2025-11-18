// NÃO declare nenhuma variável do Supabase aqui
// O cliente supabase já vem do supabaseClient.js

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

  // IDs CORRETOS conforme o admin.html
  const name = document.getElementById("cardName").value;
  const rarity = document.getElementById("cardRarity").value;
  const element = document.getElementById("cardElement").value;
  const power = parseInt(document.getElementById("cardPower").value);
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!name || !rarity || !element || !power) {
    alert("Preencha todos os campos!");
    return;
  }

  if (!file) {
    alert("Selecione uma imagem primeiro!");
    return;
  }

  // COMPACTAÇÃO (opcional mas recomendado)
  const compressed = await compressImage(file);

  // UPLOAD NO STORAGE
  const filePath = `cartas/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("cartas")
    .upload(filePath, compressed);

  if (uploadError) {
    console.error(uploadError);
    alert("Erro ao enviar imagem!");
    return;
  }

  // PEGAR URL PÚBLICA
  const { data: publicUrl } = supabase.storage
    .from("cartas")
    .getPublicUrl(filePath);

  const imageUrl = publicUrl.publicUrl;

  // SALVAR NO BANCO
  const { error } = await supabase
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

  if (error) {
    console.error(error);
    alert("Erro ao salvar no banco!");
    return;
  }

  alert("Carta salva com sucesso!");
}
