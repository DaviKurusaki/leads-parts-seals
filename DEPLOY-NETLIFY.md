# Publicação no Netlify

O projeto está preparado para usar:

- `public/` como site estático;
- `netlify/functions/api.cjs` como API Express serverless;
- `netlify/functions/campaign-runner.cjs` como agendador da campanha;
- Supabase como banco de dados e autenticação;
- cookies seguros e `HttpOnly` para a sessão.

## 1. Criar o site

No Netlify, escolha **Add new project > Import an existing project**, conecte o
repositório GitHub e selecione este projeto. O arquivo `netlify.toml` configura
automaticamente o comando, a pasta publicada, a API e o agendamento.

## 2. Cadastrar as variáveis

Abra **Project configuration > Environment variables** e importe o `.env`.
Cadastre pelo menos:

```env
DATA_BACKEND=supabase
SUPABASE_URL=https://frcmigvbuzhxbdxwvvna.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ZFQIFaCNHMZT4u3r3zl7VQ_HuPqu7ff
SUPABASE_SECRET_KEY=

TIMEZONE=America/Sao_Paulo
SEND_MODE=dry-run
DOMAIN_AUTH_CONFIRMED=false

SENDER_NAME=Parts Seals
SENDER_EMAIL=vendas@parts-seals.com.br
SENDER_PHONE=(19) 3626-3552 | (19) 98301-1817
SENDER_SITE=https://parts-seals.com.br
REPLY_TO=vendas@parts-seals.com.br
BROCHURE_FILE=./output/pdf/apresentacao-comercial-parts-seals.pdf

SMTP_HOST=email-ssl.com.br
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=vendas@parts-seals.com.br
SMTP_PASS=

IMAP_ENABLED=true
IMAP_HOST=email-ssl.com.br
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=vendas@parts-seals.com.br
IMAP_PASS=
IMAP_MAILBOX=INBOX
IMAP_SENT_MAILBOX=INBOX.Sent
REQUIRE_SENT_COPY=true

AUTO_BATCH_SIZE=12
AUTO_BATCH_INTERVAL_MINUTES=15
AUTO_BATCH_WINDOWS=09:30-10:30,14:00-15:00
AUTO_BATCH_WEEKDAYS_ONLY=true
AUTO_BATCH_MAX_PER_DAY=120
AUTO_BATCH_MAX_PER_HOUR=60

MAX_PER_DAY=20
MAX_PER_HOUR=5
MIN_INTERVAL_MINUTES=8
BUSINESS_START=08:00
BUSINESS_END=17:00
FOLLOWUP1_BUSINESS_DAYS=4
FOLLOWUP2_BUSINESS_DAYS=9
```

Preencha os campos em branco somente no Netlify. Marque como **Contains secret
values**: `SUPABASE_SECRET_KEY`, `SMTP_PASS`, `IMAP_PASS` e `OPENAI_API_KEY`,
quando usada. Nunca coloque esses valores no GitHub ou em `netlify.toml`.

O usuário `Admin` deste projeto já está cadastrado no Supabase Auth e não exige
que a senha seja colocada nas variáveis do Netlify. Use
`INITIAL_ADMIN_USERNAME` e `INITIAL_ADMIN_PASSWORD` somente se migrar para um
Supabase totalmente novo; nesse caso, remova a senha inicial após o primeiro
login.

## 3. Publicar e validar

Acione **Deploy site**. Depois que o deploy terminar:

1. abra o endereço `*.netlify.app`;
2. entre com o usuário `Admin`;
3. troque a senha;
4. abra **Usuários** para criar as demais contas;
5. confirme que o painel mostra os 986 leads e 77 clientes ativos;
6. mantenha `SEND_MODE=dry-run` até concluir os testes.

Alterações em variáveis de ambiente exigem um novo deploy para entrarem em
vigor. O agendador funciona apenas no deploy publicado; previews de branches
não executam a agenda automaticamente.

Quando a campanha estiver ativa, o Netlify chama o processador a cada cinco
minutos. O aplicativo confere o horário no fuso `America/Sao_Paulo` e reserva
um único lote a cada 15 minutos, de segunda a sexta, nas janelas de
09:30–10:30 e 14:00–15:00. A frequência de cinco minutos permite recuperar
uma execução atrasada ou perdida. Cada horário é reservado no Supabase antes
do processamento, evitando que as tentativas extras repitam o lote.

A função agendada apenas valida a janela e entrega o lote ao
`campaign-worker-background`, que pode trabalhar por até 15 minutos. Isso evita
que conexões SMTP ou IMAP lentas ultrapassem o limite de 30 segundos das funções
agendadas. Jobs interrompidos são liberados novamente após 15 minutos.

Cada envio ao vivo é copiado via IMAP para `IMAP_SENT_MAILBOX`, ficando visível
em Enviados no Outlook. Se essa gravação falhar após duas tentativas, a campanha
é pausada automaticamente. Para liberar envios reais, altere `SEND_MODE=live` e
`DOMAIN_AUTH_CONFIRMED=true`, faça um novo deploy e inicie a campanha no painel.

Referências oficiais:

- [Express no Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/express/)
- [Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)
- [Variáveis de ambiente em Functions](https://docs.netlify.com/build/functions/environment-variables/)
