# 🗳️ Sistema VOTA IASD

Sistema de votação em tempo real desenvolvido sob medida para assembleias e comissões da **Igreja Adventista do Sétimo Dia**, com interface de projeção para telões, experiência acessível para celulares e **áudio autêntico de confirmação da urna eletrônica do TSE**.

---

## 🌐 Links Online em Produção (No Ar!)

* 📱 **Celular do Votante**: [https://vota-iasd-central.web.app](https://vota-iasd-central.web.app)
* 🖥️ **Telão de Projeção (TV / Projetor)**: [https://vota-iasd-central.web.app/?view=telao](https://vota-iasd-central.web.app/?view=telao)
* 🎛️ **Painel do Administrador (Líder)**: [https://vota-iasd-central.web.app/?view=admin](https://vota-iasd-central.web.app/?view=admin)
* 📦 **Repositório GitHub**: [https://github.com/irandyalves/vota-iasd](https://github.com/irandyalves/vota-iasd)

---

## ✨ Principais Funcionalidades

1. **📱 Celular do Votante (PWA)**:
   - Acesso direto via QR Code ou link curto, sem necessidade de baixar aplicativo na App Store ou Google Play.
   - Código PIN de segurança (4 dígitos) para blindar a votação contra acessos indevidos.
   - **Sala de Espera Imersiva**: Animações contínuas fluidas (pulso e giros) aguardando liberação do líder.
   - Cards de toque grandes e acessíveis com fotos nítidas dos candidatos.
   - **Som Oficial do TSE ("Pilili-li")**: Tocado instantaneamente ao clicar em "CONFIRMAR VOTO".
   - Trava de voto único por dispositivo para garantir a integridade da apuração.

2. **🖥️ Telão / Painel Estendido (Projetor ou TV)**:
   - QR Code gigante de entrada e PIN de acesso sempre visíveis.
   - **Corrida de Barras Animada (60 FPS)**: Conforme os votos entram, as barras crescem e **trocam de posição vertical de forma fluida** quando um candidato ultrapassa o outro.
   - Linha demarcatória da **Zona de Titulares** e **Zona de Suplentes**.
   - Modo **Ocultar Apuração** (para votações secretas cujo resultado só é revelado ao final).
   - Efeito cinematográfico de **confetes digitais** no encerramento.

3. **🎛️ Painel do Administrador**:
   - **Microfone (Voz para Texto)**: Adicione múltiplos candidatos falando no microfone do celular ou notebook (Web Speech API).
   - Importação em lote de listas coladas do WhatsApp ou planilhas.
   - Upload de fotos com compressão automática.
   - Parametrização dinâmica: quantidade de vagas, suplentes e limite de votos por membro.
   - **Motor de Desempate Inteligente**: Detecta empates na linha de corte e gera rodadas de desempate em 1 clique.
   - **Exportação e Importação (JSON)**: Salve ou migre pautas e cadastros de membros em segundos.

---

## 🚀 Como Rodar o Projeto Localmente

```bash
# 1. Instalar dependências (já executado)
npm install

# 2. Iniciar o servidor de desenvolvimento
npm run dev
```

Abra no navegador em:
- **Painel Geral (com alternador de telas)**: `http://localhost:5173`
- **Direto no Telão (para o projetor)**: `http://localhost:5173/?view=telao`
- **Direto no Celular do Votante**: `http://localhost:5173/?view=voter`
- **Direto no Painel do Líder**: `http://localhost:5173/?view=admin`

> 💡 **Dica**: O sistema possui sincronização em tempo real entre abas no mesmo computador ou rede via `BroadcastChannel`, funcionando imediatamente mesmo antes de configurar chaves do Firebase!

---

## ☁️ Conexão e Migração para o Firebase (Conta Free da Igreja)

### 1. Criando o projeto no Firebase da Igreja (Gratuito):
1. Acesse o [Firebase Console](https://console.firebase.google.com/) com a conta Google da igreja.
2. Crie um novo projeto (ex: `vota-iasd-central`).
3. Vá em **Firestore Database** e clique em **Criar banco de dados** (inicie em modo de teste ou aplique o arquivo `firestore.rules`).
4. Em **Configurações do Projeto > Geral > Seus Aplicativos**, adicione um aplicativo Web e copie as chaves.

### 2. Configurando as Variáveis de Ambiente:
No arquivo `.env` deste projeto, preencha:

```env
VITE_FIREBASE_API_KEY=sua-api-key
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto-id
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu-sender-id
VITE_FIREBASE_APP_ID=seu-app-id
```

### 3. Deploy no Firebase Hosting (Grátis com SSL):
```bash
npm run build
npx firebase login
npx firebase init hosting
npx firebase deploy
```

---

## 🔒 Regras de Segurança e Arquitetura de Custo Zero (Spark Free Tier)

Para evitar consumo desnecessário de cotas na conta gratuita do Google:
- Os celulares dos votantes escutam apenas o documento da sessão (menos de 4 leituras por eleitor durante todo o culto).
- Cada cédula é gravada individualmente na subcoleção `ballots/`.
- Apenas a tela do Telão escuta a atualização agregada para animar as barras em tempo real.
