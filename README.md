# Radar Chapecó

Radar meteorológico em tempo real (Defesa Civil SC / SIFAP) com mapa, feixe de varredura, análise de ecos e chat regional.

## Baixar o app
Depois de configurado (passo abaixo), os arquivos ficam sempre neste endereço do seu repositório:

- **Celular Android:** `https://github.com/SEU-USUARIO/SEU-REPO/releases/latest/download/Radar-Chapeco.apk`
- **Windows (instalador):** `.../releases/latest/download/Radar-Chapeco-Instalador.exe`
- **Windows (sem instalar):** `.../releases/latest/download/Radar-Chapeco-Portatil.exe`

No celular: abra o link, baixe o APK, toque nele e permita "instalar apps desconhecidos".
No Windows: se aparecer "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo** (o app não tem assinatura paga da Microsoft).

## Como gerar (GitHub Actions — sem instalar nada)
1. Crie uma conta em github.com e um repositório novo (pode ser público).
2. Na página do repositório: **Add file → Upload files** e arraste **todo o conteúdo** desta pasta (incluindo a pasta `.github`). Clique em **Commit changes**.
3. Abra a aba **Actions**: o build "Gerar APK e app Windows" roda sozinho (~10 min).
4. Ao terminar, a aba **Releases** terá o APK e os .exe. A cada novo envio de arquivos, sai uma versão nova
   que instala por cima da anterior.

## Como funciona sem servidor
O APK e o app Windows buscam as imagens direto na Defesa Civil SC (`src/services/radarDirect.ts`) e
tornam o fundo preto transparente no próprio aparelho. Não é preciso publicar o `server.ts`.

- **Chat:** sem servidor, só funciona com Supabase. Rode `supabase-schema.sql` no seu projeto Supabase e
  adicione em **Settings → Secrets and variables → Actions** os secrets `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY`; o próximo build já sai com chat.
- **Usar um servidor próprio (opcional):** adicione o secret `VITE_API_BASE=https://seu-servidor` e o app passa a usar o backend.

## Rodar local (web + servidor)
```bash
npm install
npm run dev        # http://localhost:3000
npm run desktop    # app Windows/Electron local
```

## Limitações
- O alerta sonoro só toca com o app aberto.
- A chave de assinatura (`android/app/radar-release.keystore`) está no projeto para que atualizações
  instalem por cima. Para publicar na Play Store, use uma chave própria e privada.
