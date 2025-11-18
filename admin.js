// NÃO declare nenhuma variável do Supabase aqui
// Apenas use o cliente já criado no supabaseClient.js

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

  // PEGAR OS CAMPOS
  const name = document.getElementById("card-name").value;
  const rarity = document.getElementById("card-rarity").value;
  const element = document.getElementById("card-element").value;
  const power = parseInt(document.getElementById("card-power").value);
  const fileInput = document.getElementById("card-image-file");
  const file = fileInput.files[0];

  if (!file) {
    alert("Selecione uma imagem primeiro!");
    return;
  }

  // COMPACTAR A IMAGEM
  const compressed = await compressImage(file);

  // UPLOAD NO STORAGE
  const filePath = `cartas/${Date.now()}_${file.name}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
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
  const { data, error } = await supabase
    .from("cards")
    .insert([
      { name, rarity, element, power, image_url: imageUrl }
    ]);

  if (error) {
    console.error(error);
    alert("Erro ao salvar no banco!");
    return;
  }

  alert("Carta salva com sucesso!");
}
