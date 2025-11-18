// 🔥 CONFIGURE SUA SUPABASE AQUI 🔥
const SUPABASE_URL = "https://ujpbdoykjrntqketqjxa.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqcGJkb3lranJudHFrZXRxanhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0NTcxNDAsImV4cCI6MjA3OTAzMzE0MH0.kYstg_WVcsAANWWf942_qhrJLYyrPRR_gbN83kIqQxQ";

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// 🔥 Compressão de imagem (mantém qualidade e reduz tamanho)
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
        0.8 // qualidade
      );
    };
  });
}

async function uploadCard() {
  const name = document.getElementById("cardName").value;
  const power = parseInt(document.getElementById("cardPower").value);
  const rarity = document.getElementById("cardRarity").value;
  const element = document.getElementById("cardElement").value;
  const file = document.getElementById("fileInput").files[0];

  if (!name || !file) {
    alert("Preencha o nome da carta e selecione uma imagem.");
    return;
  }

  // 1. Compressor
  const compressed = await compressImage(file);

  // 2. Upload para o storage
  const filePath = `cards/${Date.now()}-${file.name}.jpg`;

  let { data, error } = await supabase.storage
    .from("cartas")
    .upload(filePath, compressed);

  if (error) {
    alert("Erro ao enviar imagem: " + error.message);
    return;
  }

  // 3. Pegar URL pública
  const { data: urlData } = supabase.storage.from("cartas").getPublicUrl(filePath);
  const imageUrl = urlData.publicUrl;

  // 4. Salvar no banco
  await supabase.from("cards").insert([
    {
      name,
      power,
      rarity,
      element,
      image_url: imageUrl,
    },
  ]);

  alert("Carta criada com sucesso!");
}

