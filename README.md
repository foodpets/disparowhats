# 💬 Disparo WhatsApp — API Oficial

Sistema simples para disparar **imagem + texto** usando a **API oficial do WhatsApp**
(WhatsApp Business Cloud API da Meta), com duas formas de uso:

| Forma | Como |
|---|---|
| 🌐 **Pelo navegador (GitHub Pages)** | App 100% estático — o navegador chama a API da Meta diretamente. Nada passa por servidor intermediário. |
| 🐍 **Pelo terminal (Python)** | Script `enviar.py` para automatizar em lote via linha de comando. |

> Site publicado em: **https://foodpets.github.io/disparowhats/**

---

## 🔑 Pré-requisitos

Você precisa de 2 informações do [Meta for Developers](https://developers.facebook.com/):

1. **Phone Number ID** — o ID do seu número de WhatsApp Business conectado ao app.
2. **Token de acesso** — token da Cloud API (não confundir com token do GitHub!).

### Como obter (passo a passo)

1. Acesse [developers.facebook.com](https://developers.facebook.com/) → **Meus apps** → crie um app do tipo **Negócios**.
2. No painel do app, adicione o produto **WhatsApp**.
3. Em **WhatsApp → Início (API Setup)** você encontra o **Phone Number ID** e um **token temporário de 24 horas** — ideal para testar.
4. Para uso contínuo, crie um **token permanente**:
   - [Business Settings](https://business.facebook.com/settings) → **Usuários do sistema** → crie um usuário do sistema → gere um token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.

> ⚠️ O número usado precisa estar registrado na Cloud API (número exclusivo da API — não pode estar ativo no WhatsApp comum do celular).

---

## 🌐 Usar pelo site (GitHub Pages)

1. Abra **https://foodpets.github.io/disparowhats/**
2. Preencha **Phone Number ID** e **Token** (clique em *Testar conexão* para validar).
3. Escolha o tipo de envio:
   - **🖼️ Imagem com legenda** — envia a imagem e o texto como legenda (padrão da API);
   - **📝 Somente texto** — mensagem de texto simples (com pré-visualização de links);
   - **📋 Template aprovado** — imagem no cabeçalho + variáveis no corpo, para contatos **fora da janela de 24h**.
4. Imagem por **URL pública** ou **upload do arquivo** (o app sobe uma vez para a Meta e reaproveita o ID para todos os números).
5. Cole os números (um por linha, com DDI — o app completa o `55` se faltar), defina o intervalo e clique em **🚀 Disparar**.
6. Acompanhe o registro em tempo real e baixe o **CSV** com os resultados.

**Privacidade:** o token só é salvo no navegador se você marcar "Lembrar token" (fica no `localStorage` da sua máquina). Nenhum dado é enviado para outro servidor além da API da Meta.

---

## ⏱️ Janela de 24 horas (importante!)

- **Mensagens livres** (imagem/texto) só são entregues a números que **mandaram mensagem para você nas últimas 24h**.
- Para **primeiro contato** (marketing/ativos), é obrigatório usar **template aprovado** no [WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/) — com cabeçalho de imagem e variáveis no corpo.
- Sem template, a API retorna o erro `131047` (re-engagement). O app avisa isso automaticamente quando acontece.

## 🖼️ Sobre a imagem

- Formatos aceitos: **JPEG, PNG e WebP estático**, até **5 MB**.
- Por URL: o link precisa ser **público** (https, sem senha). Dica: você pode hospedar as imagens no próprio GitHub (por exemplo, numa pasta `imagens/` deste repositório e usar a URL do Pages).
- Por upload: o arquivo é enviado ao endpoint `/media` da Meta, que devolve um **ID** reutilizado para todos os destinatários do lote (mais rápido e recomendado pela própria Meta).

---

## 🐍 Usar pelo Python (terminal)

```bash
pip install requests

# credenciais (ou passe via --token / --phone-id)
export WHATSAPP_TOKEN="EAAG..."
export WHATSAPP_PHONE_ID="123456789012345"

# imagem + legenda para um arquivo de números
python3 enviar.py --numeros lista.txt --imagem https://seusite.com/promo.jpg \
    --legenda "Olá! Confira nossa promoção 😊" --delay 5 --csv log.csv

# somente texto
python3 enviar.py --numeros 5511999998888,5521988887777 --texto "Bom dia!"

# template aprovado (primeiro contato)
python3 enviar.py --numeros lista.txt --template promocao_novembro \
    --imagem https://seusite.com/promo.jpg \
    --variaveis "Olá Maria|50% OFF|Válido até sexta"
```

---

## 🚀 Rodar localmente / publicar

- **Local:** basta abrir o `index.html` no navegador (ou `python3 -m http.server 8000` e acessar `http://localhost:8000`).
- **GitHub Pages:** já configurado via branch `main` (pasta raiz). Se precisar reativar: **Settings → Pages → Deploy from a branch → main / (root)**.

## ⚠️ Boas práticas e políticas da Meta

- Envie apenas para números que **autorizaram** o contato (*opt-in*).
- Disparo sem consentimento viola as políticas da Meta e **pode banir seu número** e reduzir a qualidade/limite da sua conta.
- Respeite limites de taxa: use intervalos (o padrão do app é 4 s) e comece com volumes baixos.

## 🔒 Segurança

- Nunca suba tokens no repositório — o app pede o token a cada sessão (ou guarda só no seu navegador).
- Se um token foi exposto em conversa, prints ou código, **revogue-o imediatamente** em [developers.facebook.com → Apps → Configurações → Básico](https://developers.facebook.com/apps/) ou nos usuários do sistema do Business Manager.
